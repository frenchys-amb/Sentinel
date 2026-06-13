"""
Modelos del Sistema de Inventario de Medicamentos
Diseñados para inmutabilidad, auditoría y cumplimiento normativo.
"""
import hashlib
import json
from datetime import timedelta
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.utils import timezone


class Usuario(AbstractUser):
    """Usuario extendido con licencia de paramédico"""
    ROL_CHOICES = [
        ('PARAMEDICO', 'Paramédico'),
        ('ADMIN', 'Administrador'),
        ('AUDITOR', 'Auditor'),
    ]

    rol = models.CharField(max_length=20, choices=ROL_CHOICES, default='PARAMEDICO')
    numero_licencia = models.CharField(max_length=50, unique=True, blank=True, null=True)
    fecha_vencimiento_licencia = models.DateField(blank=True, null=True)
    firma_digital = models.TextField(blank=True, null=True, help_text="Hash de firma digital")
    telefono = models.CharField(max_length=20, blank=True)
    unidad_asignada = models.CharField(max_length=100, blank=True)
    activo = models.BooleanField(default=True)
    intentos_fallidos = models.PositiveIntegerField(default=0,
        help_text="Contador de intentos de login fallidos consecutivos")
    bloqueado_hasta = models.DateTimeField(blank=True, null=True,
        help_text="Fecha/hora hasta la cual el usuario esta bloqueado temporalmente")
    bloqueado_permanente = models.BooleanField(default=False,
        help_text="Bloqueo permanente que requiere desbloqueo manual por administrador")

    class Meta:
        db_table = 'usuarios'

    @property
    def licencia_vigente(self):
        if not self.fecha_vencimiento_licencia:
            return False
        return self.fecha_vencimiento_licencia >= timezone.now().date()

    @property
    def licencia_por_vencer(self):
        if not self.fecha_vencimiento_licencia:
            return False
        dias_restantes = (self.fecha_vencimiento_licencia - timezone.now().date()).days
        return 0 <= dias_restantes <= 30

    @property
    def puede_administrar(self):
        """Bloquea administración si licencia expirada o por vencer"""
        if not self.numero_licencia:
            return False
        if not self.licencia_vigente:
            return False
        return True

    @property
    def esta_bloqueado(self):
        """Verifica si el usuario esta bloqueado temporal o permanentemente"""
        if self.bloqueado_permanente:
            return True
        if self.bloqueado_hasta and timezone.now() < self.bloqueado_hasta:
            return True
        return False

    @property
    def tiempo_bloqueo_restante(self):
        """Retorna los segundos restantes de bloqueo temporal, o 0 si no esta bloqueado"""
        if self.bloqueado_hasta and timezone.now() < self.bloqueado_hasta:
            delta = self.bloqueado_hasta - timezone.now()
            return int(delta.total_seconds())
        return 0

    def registrar_intento_fallido(self):
        """
        Registra un intento fallido de login para todos los roles.
        - 3 intentos fallidos -> bloqueo temporal de 1 minuto
        - 3 intentos mas (6 total) -> bloqueo permanente
        Usa F() expressions para evitar race conditions.
        """
        from django.db.models import F
        from django.db import transaction as db_transaction

        with db_transaction.atomic():
            # Lock the row to prevent race conditions
            user = Usuario.objects.select_for_update().get(pk=self.pk)
            user.intentos_fallidos += 1

            if user.intentos_fallidos >= 6:
                user.bloqueado_permanente = True
                user.bloqueado_hasta = None
            elif user.intentos_fallidos >= 3:
                user.bloqueado_hasta = timezone.now() + timedelta(minutes=1)

            user.save(update_fields=['intentos_fallidos', 'bloqueado_hasta', 'bloqueado_permanente'])
            # Update in-memory state
            self.intentos_fallidos = user.intentos_fallidos
            self.bloqueado_hasta = user.bloqueado_hasta
            self.bloqueado_permanente = user.bloqueado_permanente

    def limpiar_intentos_fallidos(self):
        """Limpia el contador de intentos fallidos tras login exitoso"""
        if self.intentos_fallidos > 0 or self.bloqueado_hasta:
            self.intentos_fallidos = 0
            self.bloqueado_hasta = None
            self.save(update_fields=['intentos_fallidos', 'bloqueado_hasta'])

    def desbloquear(self):
        """Desbloquea el usuario (solo por administrador)"""
        self.intentos_fallidos = 0
        self.bloqueado_hasta = None
        self.bloqueado_permanente = False
        self.save(update_fields=['intentos_fallidos', 'bloqueado_hasta', 'bloqueado_permanente'])


class Caja(models.Model):
    """Caja/contenedor de medicamentos"""
    ESTADO_CHOICES = [
        ('ACTIVA', 'Activa'),
        ('EN_TRANSITO', 'En Tránsito'),
        ('CERRADA', 'Cerrada'),
        ('EXTRAVIADA', 'Extraviada'),
    ]

    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=100)
    ubicacion = models.CharField(max_length=100, blank=True)
    unidad = models.CharField(max_length=100, blank=True)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='ACTIVA')
    responsable = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='cajas_responsable', blank=True, null=True)
    base = models.ForeignKey('Base', on_delete=models.SET_NULL, related_name='cajas', blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cajas'

    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class Medicamento(models.Model):
    """Catálogo de medicamentos"""
    TIPO_CHOICES = [
        ('GENERAL', 'General'),
        ('CONTROLADO', 'Controlado'),
        ('NARCOTICO', 'Narcótico'),
    ]

    DEA_SCHEDULE_CHOICES = [
        ('II', 'Schedule II'),
        ('III', 'Schedule III'),
        ('IV', 'Schedule IV'),
        ('V', 'Schedule V'),
    ]

    nombre = models.CharField(max_length=200)
    principio_activo = models.CharField(max_length=200)
    concentracion = models.CharField(max_length=50)
    presentacion = models.CharField(max_length=100)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default='GENERAL')
    ndc = models.CharField(max_length=11, unique=True, blank=True, null=True, db_index=True,
        help_text="National Drug Code normalizado a 11 dígitos (5-4-2). "
                  "Obligatorio para narcóticos y controlados.")
    dea_schedule = models.CharField(max_length=5, choices=DEA_SCHEDULE_CHOICES, blank=True,
        help_text="Clasificación DEA de sustancia controlada (II-V)")
    codigo_barras = models.CharField(max_length=100, unique=True, blank=True, null=True)
    requiere_doble_factor = models.BooleanField(default=False, 
        help_text="Narcóticos siempre requieren doble factor")
    temperatura_conservacion = models.CharField(max_length=50, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'medicamentos'

    def __str__(self):
        return f"{self.nombre} {self.concentracion}"

    def save(self, *args, **kwargs):
        # Narcóticos siempre requieren doble factor
        if self.tipo == 'NARCOTICO':
            self.requiere_doble_factor = True
        super().save(*args, **kwargs)


class Inventario(models.Model):
    """Stock actual por caja y medicamento"""
    caja = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name='inventarios')
    medicamento = models.ForeignKey(Medicamento, on_delete=models.PROTECT, related_name='inventarios')
    cantidad = models.PositiveIntegerField(default=0, validators=[MinValueValidator(0)])
    lote = models.CharField(max_length=50, blank=True)
    fecha_caducidad = models.DateField(blank=True, null=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventarios'
        unique_together = ['caja', 'medicamento', 'lote']

    @property
    def proximo_a_vencer(self):
        if not self.fecha_caducidad:
            return False
        dias = (self.fecha_caducidad - timezone.now().date()).days
        return dias <= 60

    @property
    def vencido(self):
        if not self.fecha_caducidad:
            return False
        return self.fecha_caducidad < timezone.now().date()


class Transaccion(models.Model):
    """
    Registro inmutable de todas las operaciones.
    UPDATE y DELETE están bloqueados a nivel de base de datos (RLS).
    """
    TIPO_CHOICES = [
        ('RECEIPT', 'Recepción/Compra'),
        ('PICKUP', 'Recolección'),
        ('TRANSFER', 'Transferencia'),
        ('RETURN', 'Devolución'),
        ('WASTE', 'Descarte'),
        ('ADMINISTRATION', 'Administración'),
        ('DAMAGE', 'Daño/Incidencia'),
        ('INVENTORY', 'Ajuste de Inventario'),
    ]

    # Campos de identificación y cadena criptográfica
    id = models.BigAutoField(primary_key=True)
    hash_transaccion = models.CharField(max_length=64, unique=True, db_index=True)
    hash_anterior = models.CharField(max_length=64, blank=True, default='GENESIS',
        help_text="Hash de la transacción anterior — forma cadena inmutable")

    # Participantes (Doble Factor)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='transacciones_realizadas')
    testigo = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='transacciones_testigo',
                                blank=True, null=True, help_text="Requerido para narcóticos y descartes")

    # Detalles de la transacción
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    caja_origen = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name='transacciones_salida',
                                    blank=True, null=True)
    caja_destino = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name='transacciones_entrada',
                                     blank=True, null=True)
    medicamento = models.ForeignKey(Medicamento, on_delete=models.PROTECT, related_name='transacciones')
    cantidad = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    lote = models.CharField(max_length=50, blank=True)
    fecha_caducidad = models.DateField(blank=True, null=True,
        help_text="Fecha de expiración del lote — se propaga al inventario al recibir")

    # Contexto
    paciente_id = models.CharField(max_length=100, blank=True, help_text="ID anónimo del paciente")
    motivo = models.TextField(blank=True)
    ubicacion = models.CharField(max_length=200, blank=True)

    # Evidencia fotográfica (URLs a Supabase Storage)
    evidencia_urls = models.JSONField(default=list, blank=True, 
        help_text="Array de URLs de evidencia fotográfica")

    # Firmas digitales
    firma_usuario = models.CharField(max_length=64, blank=True)
    firma_testigo = models.CharField(max_length=64, blank=True)

    # Timestamp inmutable (set explicitly in save() for hash determinism)
    timestamp = models.DateTimeField(db_index=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True)

    # Metadata de sincronización offline
    offline_id = models.CharField(max_length=100, blank=True, db_index=True,
                                  help_text="ID generado en dispositivo offline")
    sincronizado = models.BooleanField(default=True)
    fecha_sincronizacion = models.DateTimeField(blank=True, null=True)

    # Versión de la fórmula de hash. Las transacciones históricas (v1) se
    # verifican con la fórmula original; v2 incluye fecha_caducidad.
    hash_version = models.PositiveSmallIntegerField(default=2)

    class Meta:
        db_table = 'transacciones'
        ordering = ['-timestamp']
        # Política RLS: Solo INSERT permitido. UPDATE/DELETE bloqueados.

    def generar_hash(self):
        """
        Genera hash SHA-256 encadenado y determinístico.
        hash = SHA256(datos_transaccion + hash_anterior)
        Esto forma una cadena inmutable tipo blockchain — cualquier
        alteración histórica rompe la cadena desde ese punto.
        Cumplimiento: DEA 21 CFR 1304.04, 21 CFR 1304.21
        """
        data = {
            'usuario_id': self.usuario_id,
            'testigo_id': self.testigo_id,
            'caja_origen_id': self.caja_origen_id,
            'caja_destino_id': self.caja_destino_id,
            'tipo': self.tipo,
            'medicamento_id': self.medicamento_id,
            'cantidad': self.cantidad,
            'lote': self.lote,
            'firma_usuario': self.firma_usuario,
            'paciente_id': self.paciente_id,
            'timestamp': self.timestamp.isoformat(),
            'hash_anterior': self.hash_anterior,
        }
        # v1 (transacciones históricas) no incluía fecha_caducidad — agregar
        # el campo a su dict cambiaría el hash y rompería la verificación.
        if self.hash_version >= 2:
            data['fecha_caducidad'] = (
                self.fecha_caducidad.isoformat() if self.fecha_caducidad else None
            )
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()

    def save(self, *args, **kwargs):
        from django.db import transaction
        # Always force server timestamp — prevents client backdating
        self.timestamp = timezone.now()
        if not self.hash_transaccion:
            # Get the hash of the most recent transaction for chaining
            # select_for_update prevents race conditions in concurrent requests
            with transaction.atomic():
                ultima = Transaccion.objects.select_for_update().order_by('-id').values_list('hash_transaccion', flat=True).first()
                self.hash_anterior = ultima or 'GENESIS'
            self.hash_transaccion = self.generar_hash()
        super().save(*args, **kwargs)

    @staticmethod
    def verificar_cadena(limit=None):
        """
        Verifica la integridad de toda la cadena de transacciones.
        Retorna dict con resultado y detalles de cualquier ruptura.
        """
        qs = Transaccion.objects.order_by('id')
        if limit:
            qs = qs[:limit]

        resultados = {'valida': True, 'verificadas': 0, 'errores': []}
        hash_anterior_esperado = 'GENESIS'

        for tx in qs.iterator():
            # Verify chain link
            if tx.hash_anterior != hash_anterior_esperado:
                resultados['valida'] = False
                resultados['errores'].append({
                    'transaccion_id': tx.id,
                    'tipo': 'CADENA_ROTA',
                    'esperado': hash_anterior_esperado,
                    'encontrado': tx.hash_anterior,
                })

            # Verify hash integrity
            hash_recalculado = tx.generar_hash()
            if tx.hash_transaccion != hash_recalculado:
                resultados['valida'] = False
                resultados['errores'].append({
                    'transaccion_id': tx.id,
                    'tipo': 'HASH_ALTERADO',
                    'hash_almacenado': tx.hash_transaccion,
                    'hash_recalculado': hash_recalculado,
                })

            hash_anterior_esperado = tx.hash_transaccion
            resultados['verificadas'] += 1

        return resultados

    def __str__(self):
        return f"{self.tipo} #{self.id} - {self.hash_transaccion[:16]}"


class SystemLog(models.Model):
    """
    Log de auditoría inalterable.
    Registra: cambios de IP, intentos fallidos de login, intentos de alteración.
    """
    CATEGORIA_CHOICES = [
        ('LOGIN', 'Inicio de Sesión'),
        ('LOGIN_FAIL', 'Intento Fallido'),
        ('TRANSACCION', 'Transacción'),
        ('ALERTA', 'Alerta de Seguridad'),
        ('INTENTO_ALTERACION', 'Intento de Alteración'),
        ('CONFIG', 'Cambio de Configuración'),
        ('SYNC', 'Sincronización Offline'),
    ]

    categoria = models.CharField(max_length=20, choices=CATEGORIA_CHOICES)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, blank=True, null=True)
    descripcion = models.TextField()
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'system_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.categoria}] {self.timestamp} - {self.descripcion[:50]}"


class Alerta(models.Model):
    """Sistema de alertas automáticas"""
    TIPO_CHOICES = [
        ('DESVIO', 'Posible Desvío'),
        ('VENCIMIENTO', 'Próximo a Vencer'),
        ('VENCIDO', 'Medicamento Vencido'),
        ('CAJA_EXTRAVIADA', 'Caja Extraviada'),
        ('LICENCIA', 'Licencia por Vencer'),
        ('INVENTARIO_BAJO', 'Inventario Bajo'),
        ('DISCREPANCIA', 'Discrepancia Detectada'),
    ]

    SEVERIDAD_CHOICES = [
        ('BAJA', 'Baja'),
        ('MEDIA', 'Media'),
        ('ALTA', 'Alta'),
        ('CRITICA', 'Crítica'),
    ]

    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    severidad = models.CharField(max_length=10, choices=SEVERIDAD_CHOICES)
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField()
    usuario_relacionado = models.ForeignKey(Usuario, on_delete=models.PROTECT, 
                                            blank=True, null=True, related_name='alertas')
    caja_relacionada = models.ForeignKey(Caja, on_delete=models.PROTECT,
                                         blank=True, null=True, related_name='alertas')
    medicamento_relacionado = models.ForeignKey(Medicamento, on_delete=models.PROTECT,
                                                blank=True, null=True, related_name='alertas')
    transaccion_relacionada = models.ForeignKey(Transaccion, on_delete=models.PROTECT,
                                                blank=True, null=True, related_name='alertas')
    resuelta = models.BooleanField(default=False)
    fecha_resolucion = models.DateTimeField(blank=True, null=True)
    resuelta_por = models.ForeignKey(Usuario, on_delete=models.PROTECT,
                                     blank=True, null=True, related_name='alertas_resueltas')
    notas_resolucion = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'alertas'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.severidad}] {self.tipo}: {self.titulo}"


class Incidente(models.Model):
    """Investigación formal de incidentes con flujo de aprobación"""
    TIPO_CHOICES = [
        ('DANO', 'Daño de medicamento'),
        ('PERDIDA', 'Pérdida / faltante'),
        ('DISCREPANCIA', 'Discrepancia de inventario'),
        ('DESCARTE_INCOMPLETO', 'Descarte incompleto'),
        ('DESVIO', 'Posible desvío'),
        ('VENCIMIENTO', 'Medicamento vencido no retirado'),
        ('OTRO', 'Otro'),
    ]

    ESTADO_CHOICES = [
        ('ABIERTO', 'Abierto'),
        ('EN_INVESTIGACION', 'En investigación'),
        ('PENDIENTE_APROBACION', 'Pendiente de aprobación'),
        ('CERRADO', 'Cerrado'),
    ]

    SEVERIDAD_CHOICES = [
        ('BAJA', 'Baja'),
        ('MEDIA', 'Media'),
        ('ALTA', 'Alta'),
        ('CRITICA', 'Crítica'),
    ]

    tipo = models.CharField(max_length=25, choices=TIPO_CHOICES)
    estado = models.CharField(max_length=25, choices=ESTADO_CHOICES, default='ABIERTO')
    severidad = models.CharField(max_length=10, choices=SEVERIDAD_CHOICES, default='MEDIA')
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField()

    # Related entities
    caja_relacionada = models.ForeignKey(Caja, on_delete=models.PROTECT,
                                         blank=True, null=True, related_name='incidentes')
    medicamento_relacionado = models.ForeignKey(Medicamento, on_delete=models.PROTECT,
                                                blank=True, null=True, related_name='incidentes')
    transaccion_relacionada = models.ForeignKey(Transaccion, on_delete=models.PROTECT,
                                                blank=True, null=True, related_name='incidentes')
    alerta_origen = models.ForeignKey(Alerta, on_delete=models.SET_NULL,
                                      blank=True, null=True, related_name='incidentes')

    # People
    reportado_por = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='incidentes_reportados')
    investigador = models.ForeignKey(Usuario, on_delete=models.PROTECT,
                                     blank=True, null=True, related_name='incidentes_asignados')
    aprobado_por = models.ForeignKey(Usuario, on_delete=models.PROTECT,
                                     blank=True, null=True, related_name='incidentes_aprobados')

    # Investigation
    causa_raiz = models.TextField(blank=True)
    acciones_correctivas = models.TextField(blank=True)
    evidencia_urls = models.JSONField(default=list, blank=True,
        help_text="URLs de evidencia fotográfica o documental")
    cantidad_afectada = models.PositiveIntegerField(default=0)
    lote_afectado = models.CharField(max_length=50, blank=True)

    # Resolution
    resolucion = models.TextField(blank=True)
    fecha_resolucion = models.DateTimeField(blank=True, null=True)

    # Timestamps
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_index=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'incidentes'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f"[{self.estado}] {self.tipo}: {self.titulo}"


class Turno(models.Model):
    """Registro de turnos para control de límites"""
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='turnos')
    caja = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name='turnos')
    fecha_inicio = models.DateTimeField(auto_now_add=True)
    fecha_fin = models.DateTimeField(blank=True, null=True)
    activo = models.BooleanField(default=True)
    conteo_inicial_confirmado = models.BooleanField(default=False)
    conteo_final_confirmado = models.BooleanField(default=False)
    firma_inicio = models.CharField(max_length=64, blank=True)
    firma_cierre = models.CharField(max_length=64, blank=True)
    notas_cierre = models.TextField(blank=True)

    # Contadores para detección de anomalías
    contador_waste = models.PositiveIntegerField(default=0)
    contador_administration = models.PositiveIntegerField(default=0)

    # Snapshots de inventario para cadena de custodia
    snapshot_inicial = models.JSONField(default=list, blank=True,
        help_text="Inventario del sistema al iniciar turno")
    conteo_fisico_inicial = models.JSONField(default=list, blank=True,
        help_text="Conteo físico reportado por paramédico al inicio")
    snapshot_final = models.JSONField(default=list, blank=True,
        help_text="Inventario esperado al cerrar turno")
    conteo_fisico_final = models.JSONField(default=list, blank=True,
        help_text="Conteo físico reportado por paramédico al cierre")
    discrepancias = models.JSONField(default=list, blank=True,
        help_text="Diferencias detectadas entre esperado y conteo físico")

    class Meta:
        db_table = 'turnos'

    def finalizar(self, firma_cierre='', conteo_final_confirmado=False, notas_cierre='',
                  conteo_fisico_final=None, snapshot_final=None, discrepancias=None):
        self.fecha_fin = timezone.now()
        self.activo = False
        self.firma_cierre = firma_cierre
        self.conteo_final_confirmado = conteo_final_confirmado
        self.notas_cierre = notas_cierre
        if conteo_fisico_final is not None:
            self.conteo_fisico_final = conteo_fisico_final
        if snapshot_final is not None:
            self.snapshot_final = snapshot_final
        if discrepancias is not None:
            self.discrepancias = discrepancias
        self.save()


class CustodiaCaja(models.Model):
    """Registro inmutable de cadena de custodia de cada caja"""
    TIPO_CHOICES = [
        ('CHECKOUT', 'Checkout'),
        ('CHECKIN', 'Checkin'),
        ('TRANSFERENCIA', 'Transferencia de custodia'),
    ]

    caja = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name='custodias')
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    usuario_origen = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, related_name='custodias_entregadas',
        blank=True, null=True, help_text="Quién entrega la caja"
    )
    usuario_destino = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, related_name='custodias_recibidas',
        help_text="Quién recibe la caja"
    )
    snapshot_contenido = models.JSONField(default=list, blank=True,
        help_text="Inventario del sistema al momento del evento")
    conteo_fisico = models.JSONField(default=list, blank=True,
        help_text="Conteo físico reportado")
    discrepancias = models.JSONField(default=list, blank=True)
    firma_origen = models.CharField(max_length=64, blank=True)
    firma_destino = models.CharField(max_length=64, blank=True)
    notas = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'custodia_cajas'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.tipo} {self.caja.codigo} → {self.usuario_destino.username} ({self.timestamp})"


class Unidad(models.Model):
    """Unidades asignadas a usuarios y cajas (e.g. ambulancias, estaciones)"""
    nombre = models.CharField(max_length=100, unique=True)
    descripcion = models.TextField(blank=True)
    activa = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'unidades'

    def __str__(self):
        return self.nombre


class TurnoConfig(models.Model):
    """Plantilla de turno definida por admin (horarios)"""
    nombre = models.CharField(max_length=100, unique=True)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'turnos_config'

    def __str__(self):
        return f"{self.nombre} ({self.hora_inicio} - {self.hora_fin})"


class ProtocoloAcuse(models.Model):
    """
    Acuse de lectura de protocolos operativos.
    Evidencia para auditorías: quién leyó cada protocolo y cuándo.
    """
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT,
                                related_name='acuses_protocolo')
    protocolo = models.CharField(max_length=100, db_index=True,
        help_text="Identificador del protocolo, ej. eliminacion-controlados")
    version = models.CharField(max_length=20, default='1.0')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'protocolo_acuses'
        unique_together = ['usuario', 'protocolo', 'version']
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.usuario.username} → {self.protocolo} v{self.version}"


class Base(models.Model):
    """Base operativa / estacion"""
    nombre = models.CharField(max_length=100, unique=True)
    direccion = models.CharField(max_length=255, blank=True)
    descripcion = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bases'

    def __str__(self):
        return self.nombre
