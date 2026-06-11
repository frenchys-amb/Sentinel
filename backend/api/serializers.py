"""
Serializadores para la API REST
"""
from rest_framework import serializers
from core.models import (
    Usuario, Caja, Medicamento, Inventario, Transaccion, SystemLog,
    Alerta, Incidente, Turno, Unidad, CustodiaCaja, Base, TurnoConfig
)


class UsuarioSerializer(serializers.ModelSerializer):
    licencia_vigente = serializers.BooleanField(read_only=True)
    licencia_por_vencer = serializers.BooleanField(read_only=True)
    puede_administrar = serializers.BooleanField(read_only=True)
    esta_bloqueado = serializers.BooleanField(read_only=True)
    tiempo_bloqueo_restante = serializers.IntegerField(read_only=True)

    class Meta:
        model = Usuario
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'rol',
                  'numero_licencia', 'fecha_vencimiento_licencia', 'licencia_vigente',
                  'licencia_por_vencer', 'puede_administrar', 'telefono', 
                  'unidad_asignada', 'activo', 'intentos_fallidos', 'bloqueado_permanente',
                  'esta_bloqueado', 'tiempo_bloqueo_restante', 'password']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}
        }

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password and password.strip():
            user.set_password(password)
            user.save()
        return user



class CajaSerializer(serializers.ModelSerializer):
    responsable_nombre = serializers.CharField(source='responsable.get_full_name', read_only=True, default='')
    base_nombre = serializers.CharField(source='base.nombre', read_only=True, default='')

    class Meta:
        model = Caja
        fields = ['id', 'codigo', 'nombre', 'ubicacion', 'unidad', 'estado',
                  'responsable', 'responsable_nombre', 'base', 'base_nombre', 'fecha_creacion']
        extra_kwargs = {
            'responsable': {'required': False, 'allow_null': True},
            'base': {'required': False, 'allow_null': True},
            'ubicacion': {'required': False, 'allow_blank': True},
            'unidad': {'required': False, 'allow_blank': True},
        }


class MedicamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicamento
        fields = ['id', 'nombre', 'principio_activo', 'concentracion', 'presentacion',
                  'tipo', 'codigo_barras', 'requiere_doble_factor',
                  'temperatura_conservacion', 'activo']

    def validate(self, data):
        tipo = data.get('tipo', getattr(self.instance, 'tipo', None))

        if tipo == 'NARCOTICO':
            data['requiere_doble_factor'] = True

        if tipo in ('NARCOTICO', 'CONTROLADO'):
            if not data.get('concentracion', getattr(self.instance, 'concentracion', '')):
                raise serializers.ValidationError(
                    {'concentracion': 'La concentración es obligatoria para narcóticos y controlados.'}
                )
            if not data.get('presentacion', getattr(self.instance, 'presentacion', '')):
                raise serializers.ValidationError(
                    {'presentacion': 'La presentación es obligatoria para narcóticos y controlados.'}
                )

        codigo_barras = data.get('codigo_barras')
        if codigo_barras:
            qs = Medicamento.objects.filter(codigo_barras=codigo_barras)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {'codigo_barras': f'Ya existe un medicamento con el código de barras "{codigo_barras}".'}
                )

        return data


class InventarioSerializer(serializers.ModelSerializer):
    medicamento_nombre = serializers.CharField(source='medicamento.nombre', read_only=True)
    medicamento_tipo = serializers.CharField(source='medicamento.tipo', read_only=True)
    proximo_a_vencer = serializers.SerializerMethodField()
    vencido = serializers.SerializerMethodField()
    dias_para_vencer = serializers.SerializerMethodField()

    class Meta:
        model = Inventario
        fields = ['id', 'caja', 'medicamento', 'medicamento_nombre', 'medicamento_tipo',
                  'cantidad', 'lote', 'fecha_caducidad', 'proximo_a_vencer', 
                  'vencido', 'dias_para_vencer', 'fecha_actualizacion']

    def get_proximo_a_vencer(self, obj):
        return obj.proximo_a_vencer

    def get_vencido(self, obj):
        return obj.vencido

    def get_dias_para_vencer(self, obj):
        from django.utils import timezone
        if obj.fecha_caducidad:
            return (obj.fecha_caducidad - timezone.now().date()).days
        return None


class TransaccionSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)
    testigo_nombre = serializers.CharField(source='testigo.get_full_name', read_only=True)
    medicamento_nombre = serializers.CharField(source='medicamento.nombre', read_only=True)
    caja_origen_codigo = serializers.CharField(source='caja_origen.codigo', read_only=True)
    caja_destino_codigo = serializers.CharField(source='caja_destino.codigo', read_only=True)

    class Meta:
        model = Transaccion
        fields = ['id', 'hash_transaccion', 'hash_anterior', 'tipo', 'usuario', 'usuario_nombre',
                  'testigo', 'testigo_nombre', 'caja_origen', 'caja_origen_codigo',
                  'caja_destino', 'caja_destino_codigo', 'medicamento', 'medicamento_nombre',
                  'cantidad', 'lote', 'paciente_id', 'motivo', 'ubicacion',
                  'evidencia_urls', 'firma_usuario', 'firma_testigo', 'timestamp',
                  'ip_address', 'offline_id', 'sincronizado']
        read_only_fields = ['hash_transaccion', 'hash_anterior', 'timestamp', 'ip_address', 'usuario']

    def validate(self, data):
        """Validaciones de negocio"""
        request = self.context.get('request')

        # Validar licencia del usuario
        if request and hasattr(request, 'user'):
            if not request.user.puede_administrar:
                raise serializers.ValidationError(
                    {'licencia': 'Su licencia está vencida o por vencer. No puede realizar transacciones.'}
                )

        # Validar testigo para descartes
        if data.get('tipo') == 'WASTE' and not data.get('testigo'):
            raise serializers.ValidationError(
                {'testigo': 'El descarte requiere un testigo obligatorio.'}
            )

        # Validar doble factor para narcóticos
        medicamento = data.get('medicamento')
        if medicamento and medicamento.tipo == 'NARCOTICO' and not data.get('testigo'):
            raise serializers.ValidationError(
                {'testigo': 'Los narcóticos requieren testigo obligatorio.'}
            )

        # Validar firma
        if not data.get('firma_usuario'):
            raise serializers.ValidationError(
                {'firma_usuario': 'Firma digital requerida.'}
            )

        return data


class SystemLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemLog
        fields = ['id', 'categoria', 'usuario', 'descripcion', 'ip_address', 
                  'metadata', 'timestamp']
        read_only_fields = fields


class AlertaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alerta
        fields = ['id', 'tipo', 'severidad', 'titulo', 'descripcion', 
                  'usuario_relacionado', 'caja_relacionada', 'medicamento_relacionado',
                  'transaccion_relacionada', 'resuelta', 'fecha_resolucion',
                  'resuelta_por', 'notas_resolucion', 'timestamp']


class TurnoSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)
    caja_codigo = serializers.CharField(source='caja.codigo', read_only=True)
    caja_nombre = serializers.CharField(source='caja.nombre', read_only=True)

    class Meta:
        model = Turno
        fields = ['id', 'usuario', 'caja', 'fecha_inicio', 'fecha_fin', 'activo',
                  'contador_waste', 'contador_administration', 'usuario_nombre',
                  'caja_codigo', 'caja_nombre', 'conteo_inicial_confirmado',
                  'conteo_final_confirmado', 'firma_inicio', 'firma_cierre',
                  'notas_cierre', 'snapshot_inicial', 'conteo_fisico_inicial',
                  'snapshot_final', 'conteo_fisico_final', 'discrepancias']
        read_only_fields = ['usuario', 'fecha_inicio', 'fecha_fin', 'activo',
                            'contador_waste', 'contador_administration',
                            'firma_cierre', 'conteo_final_confirmado', 'notas_cierre',
                            'snapshot_inicial', 'snapshot_final', 'discrepancias']

    def validate(self, data):
        if not data.get('conteo_inicial_confirmado'):
            raise serializers.ValidationError(
                {'conteo_inicial_confirmado': 'Debe confirmar el conteo inicial de la caja.'}
            )
        if not data.get('firma_inicio'):
            raise serializers.ValidationError(
                {'firma_inicio': 'Firma de inicio requerida.'}
            )
        return data


class UnidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unidad
        fields = ['id', 'nombre', 'descripcion', 'activa', 'fecha_creacion']


class CustodiaCajaSerializer(serializers.ModelSerializer):
    usuario_origen_nombre = serializers.CharField(source='usuario_origen.get_full_name', read_only=True)
    usuario_destino_nombre = serializers.CharField(source='usuario_destino.get_full_name', read_only=True)
    caja_codigo = serializers.CharField(source='caja.codigo', read_only=True)

    class Meta:
        model = CustodiaCaja
        fields = [
            'id', 'caja', 'caja_codigo', 'tipo',
            'usuario_origen', 'usuario_origen_nombre',
            'usuario_destino', 'usuario_destino_nombre',
            'snapshot_contenido', 'conteo_fisico', 'discrepancias',
            'firma_origen', 'firma_destino', 'notas', 'timestamp',
        ]
        read_only_fields = [
            'snapshot_contenido', 'discrepancias', 'timestamp',
        ]


class IncidenteSerializer(serializers.ModelSerializer):
    reportado_por_nombre = serializers.CharField(source='reportado_por.get_full_name', read_only=True)
    investigador_nombre = serializers.CharField(source='investigador.get_full_name', read_only=True)
    aprobado_por_nombre = serializers.CharField(source='aprobado_por.get_full_name', read_only=True)
    caja_codigo = serializers.CharField(source='caja_relacionada.codigo', read_only=True)
    medicamento_nombre = serializers.CharField(source='medicamento_relacionado.nombre', read_only=True)

    class Meta:
        model = Incidente
        fields = [
            'id', 'tipo', 'estado', 'severidad', 'titulo', 'descripcion',
            'caja_relacionada', 'caja_codigo',
            'medicamento_relacionado', 'medicamento_nombre',
            'transaccion_relacionada', 'alerta_origen',
            'reportado_por', 'reportado_por_nombre',
            'investigador', 'investigador_nombre',
            'aprobado_por', 'aprobado_por_nombre',
            'causa_raiz', 'acciones_correctivas',
            'evidencia_urls', 'cantidad_afectada', 'lote_afectado',
            'resolucion', 'fecha_resolucion',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = [
            'reportado_por', 'aprobado_por', 'fecha_resolucion',
            'fecha_creacion', 'fecha_actualizacion',
        ]


class BaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Base
        fields = ['id', 'nombre', 'direccion', 'descripcion', 'fecha_creacion']
        read_only_fields = ['fecha_creacion']


class TurnoConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TurnoConfig
        fields = ['id', 'nombre', 'hora_inicio', 'hora_fin', 'fecha_creacion']
        read_only_fields = ['fecha_creacion']
