"""
Views de la API - Sistema de Inventario de Medicamentos
"""
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Sum, Q, F
from django.db import transaction
from django.http import HttpResponse
from rest_framework import viewsets, status, filters, serializers as drf_serializers, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

from core.ndc import formatear_ndc

from core.models import (
    Usuario, Caja, Medicamento, Inventario, Transaccion, SystemLog,
    Alerta, Incidente, Turno, Unidad, CustodiaCaja, Base, TurnoConfig,
    ProtocoloAcuse
)
from .serializers import (
    UsuarioSerializer, CajaSerializer, MedicamentoSerializer, InventarioSerializer,
    TransaccionSerializer, SystemLogSerializer, AlertaSerializer, IncidenteSerializer,
    TurnoSerializer, UnidadSerializer, CustodiaCajaSerializer, BaseSerializer,
    TurnoConfigSerializer, ProtocoloAcuseSerializer
)
from rest_framework.permissions import BasePermission


# ─── Utilidades compartidas ───────────────────────────────────────

def capturar_snapshot(caja):
    """Captura el estado actual del inventario de una caja"""
    items = Inventario.objects.filter(caja=caja).select_related('medicamento')
    return [
        {
            'inventario_id': inv.id,
            'medicamento_id': inv.medicamento_id,
            'medicamento_nombre': inv.medicamento.nombre,
            'medicamento_tipo': inv.medicamento.tipo,
            'cantidad': inv.cantidad,
            'lote': inv.lote,
            'fecha_caducidad': str(inv.fecha_caducidad) if inv.fecha_caducidad else None,
        }
        for inv in items
    ]


def calcular_discrepancias(snapshot, conteo_fisico):
    """Calcula diferencias entre inventario esperado y conteo físico"""
    conteo_map = {
        item['inventario_id']: item.get('cantidad_fisica', item.get('cantidad', 0))
        for item in conteo_fisico
    }
    discrepancias = []
    for item in snapshot:
        inv_id = item['inventario_id']
        esperado = item['cantidad']
        fisico = conteo_map.get(inv_id, 0)
        if esperado != fisico:
            discrepancias.append({
                'inventario_id': inv_id,
                'medicamento_nombre': item['medicamento_nombre'],
                'medicamento_tipo': item['medicamento_tipo'],
                'lote': item['lote'],
                'cantidad_esperada': esperado,
                'cantidad_fisica': fisico,
                'diferencia': fisico - esperado,
            })
    return discrepancias

class IsSystemAdmin(BasePermission):
    """Permiso exclusivo para usuarios con el rol de ADMIN"""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.rol == 'ADMIN'



class TransaccionViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet
):
    """
    ViewSet para transacciones — INMUTABLE.
    Solo permite crear (POST) y consultar (GET).
    UPDATE y DELETE están bloqueados por diseño.
    """
    queryset = Transaccion.objects.all()
    serializer_class = TransaccionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['tipo', 'usuario', 'caja_origen', 'caja_destino', 'medicamento', 'timestamp']
    search_fields = ['hash_transaccion', 'motivo', 'paciente_id']
    ordering_fields = ['timestamp', 'cantidad']

    def get_queryset(self):
        """Filtrar por caja activa del usuario si es paramédico"""
        user = self.request.user
        if user.rol == 'PARAMEDICO':
            return Transaccion.objects.filter(
                Q(usuario=user) | Q(testigo=user)
            )
        return Transaccion.objects.all()

    @transaction.atomic
    def perform_create(self, serializer):
        """Crear transacción con IP, user_agent, validación de stock y detección de anomalías"""
        ip = self.request.META.get('HTTP_X_FORWARDED_FOR', self.request.META.get('REMOTE_ADDR', ''))
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
        ua = self.request.META.get('HTTP_USER_AGENT', '')

        # Forzar usuario autenticado (previene suplantación)
        transaccion = serializer.save(
            usuario=self.request.user,
            ip_address=ip,
            user_agent=ua
        )

        # Actualizar inventario con locks y validación de stock
        self._actualizar_inventario(transaccion)

        # Actualizar contadores de turno con F() expressions
        self._actualizar_turno(transaccion)

        # Verificar anomalías
        self._verificar_anomalias(transaccion)

        # Log del sistema
        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=self.request.user,
            descripcion=f'Transacción {transaccion.tipo} creada: {transaccion.hash_transaccion[:16]}',
            ip_address=ip,
            user_agent=ua,
            metadata={
                'transaccion_id': transaccion.id,
                'tipo': transaccion.tipo,
                'hash': transaccion.hash_transaccion
            }
        )

    def _actualizar_inventario(self, transaccion):
        """Actualiza inventario con select_for_update (previene race conditions) y validación de stock"""
        if transaccion.tipo in ['ADMINISTRATION', 'WASTE', 'DAMAGE', 'TRANSFER']:
            if not transaccion.caja_origen:
                raise drf_serializers.ValidationError(
                    {'caja_origen': 'Se requiere caja de origen para este tipo de transacción.'}
                )

            inv_origen, created = Inventario.objects.select_for_update().get_or_create(
                caja=transaccion.caja_origen,
                medicamento=transaccion.medicamento,
                lote=transaccion.lote,
                defaults={'cantidad': 0}
            )

            # Validar stock disponible
            if inv_origen.cantidad < transaccion.cantidad:
                raise drf_serializers.ValidationError({
                    'cantidad': f'Stock insuficiente. Disponible: {inv_origen.cantidad}, '
                                f'solicitado: {transaccion.cantidad}.'
                })

            # Actualizar con F() expression para atomicidad
            Inventario.objects.filter(pk=inv_origen.pk).update(
                cantidad=F('cantidad') - transaccion.cantidad
            )

        if transaccion.tipo in ['RECEIPT', 'PICKUP', 'RETURN', 'TRANSFER']:
            if not transaccion.caja_destino:
                raise drf_serializers.ValidationError(
                    {'caja_destino': 'Se requiere caja de destino para este tipo de transacción.'}
                )

            inv_destino, _ = Inventario.objects.select_for_update().get_or_create(
                caja=transaccion.caja_destino,
                medicamento=transaccion.medicamento,
                lote=transaccion.lote,
                defaults={'cantidad': 0, 'fecha_caducidad': transaccion.fecha_caducidad}
            )
            Inventario.objects.filter(pk=inv_destino.pk).update(
                cantidad=F('cantidad') + transaccion.cantidad
            )
            # Si el lote ya existía sin fecha de expiración, completarla
            if transaccion.fecha_caducidad and not inv_destino.fecha_caducidad:
                Inventario.objects.filter(pk=inv_destino.pk).update(
                    fecha_caducidad=transaccion.fecha_caducidad
                )

    def _actualizar_turno(self, transaccion):
        """Actualiza contadores del turno activo con F() expressions"""
        if transaccion.tipo == 'WASTE':
            Turno.objects.filter(
                usuario=transaccion.usuario, activo=True
            ).update(contador_waste=F('contador_waste') + 1)
        elif transaccion.tipo == 'ADMINISTRATION':
            Turno.objects.filter(
                usuario=transaccion.usuario, activo=True
            ).update(contador_administration=F('contador_administration') + 1)

    def _verificar_anomalias(self, transaccion):
        """Detecta patrones anómalos y genera alertas"""
        from django.conf import settings
        config = settings.SECURITY_CONFIG

        turno = Turno.objects.filter(usuario=transaccion.usuario, activo=True).first()
        if not turno:
            return

        # Refrescar contadores desde DB (fueron actualizados con F())
        turno.refresh_from_db()

        # Alerta por exceso de descartes
        if turno.contador_waste > config['MAX_WASTE_PER_SHIFT']:
            Alerta.objects.get_or_create(
                tipo='DESVIO',
                severidad='ALTA',
                titulo='Posible Desvío - Exceso de Descartes',
                descripcion=f'El usuario {transaccion.usuario.get_full_name()} ha registrado '
                           f'{turno.contador_waste} descartes en su turno actual.',
                usuario_relacionado=transaccion.usuario,
                defaults={'transaccion_relacionada': transaccion}
            )

        # Alerta por exceso de administraciones
        if turno.contador_administration > config['MAX_ADMINISTRATION_PER_SHIFT']:
            Alerta.objects.get_or_create(
                tipo='DESVIO',
                severidad='MEDIA',
                titulo='Posible Desvío - Exceso de Administraciones',
                descripcion=f'El usuario {transaccion.usuario.get_full_name()} ha registrado '
                           f'{turno.contador_administration} administraciones en su turno.',
                usuario_relacionado=transaccion.usuario,
                defaults={'transaccion_relacionada': transaccion}
            )

    @action(detail=False, methods=['post'])
    def sincronizar_offline(self, request):
        """Sincroniza transacciones creadas offline"""
        transacciones = request.data.get('transacciones', [])
        creadas = []
        errores = []

        for data in transacciones:
            data['sincronizado'] = True
            data['fecha_sincronizacion'] = timezone.now().isoformat()
            serializer = self.get_serializer(data=data)
            if serializer.is_valid():
                try:
                    self.perform_create(serializer)
                    creadas.append(serializer.data)
                except drf_serializers.ValidationError as e:
                    errores.append({'data': data, 'errors': e.detail})
            else:
                errores.append({'data': data, 'errors': serializer.errors})

        return Response({
            'creadas': len(creadas),
            'errores': len(errores),
            'detalle_errores': errores
        })


class AlertaViewSet(viewsets.ModelViewSet):
    """ViewSet para gestión de alertas"""
    queryset = Alerta.objects.all()
    serializer_class = AlertaSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['tipo', 'severidad', 'resuelta']
    ordering_fields = ['timestamp', 'severidad']

    def get_queryset(self):
        user = self.request.user
        if user.rol == 'PARAMEDICO':
            return Alerta.objects.filter(usuario_relacionado=user)
        return Alerta.objects.all()

    @action(detail=True, methods=['post'])
    def resolver(self, request, pk=None):
        """Marcar alerta como resuelta"""
        alerta = self.get_object()
        alerta.resuelta = True
        alerta.fecha_resolucion = timezone.now()
        alerta.resuelta_por = request.user
        alerta.notas_resolucion = request.data.get('notas', '')
        alerta.save()

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Alerta {alerta.id} resuelta: {alerta.titulo}',
            metadata={'alerta_id': alerta.id}
        )

        return Response({'status': 'Alerta resuelta'})


class IncidenteViewSet(viewsets.ModelViewSet):
    """Gestión de incidentes con flujo de investigación y aprobación"""
    queryset = Incidente.objects.all()
    serializer_class = IncidenteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['tipo', 'estado', 'severidad', 'caja_relacionada', 'investigador']
    search_fields = ['titulo', 'descripcion', 'causa_raiz', 'lote_afectado']
    ordering_fields = ['fecha_creacion', 'severidad']

    def get_queryset(self):
        user = self.request.user
        if user.rol == 'PARAMEDICO':
            return Incidente.objects.filter(
                Q(reportado_por=user) | Q(investigador=user)
            )
        return Incidente.objects.all()

    def perform_create(self, serializer):
        incidente = serializer.save(reportado_por=self.request.user)
        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=self.request.user,
            descripcion=f'Incidente creado: [{incidente.tipo}] {incidente.titulo}',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'incidente_id': incidente.id,
                'tipo': incidente.tipo,
                'severidad': incidente.severidad,
            },
        )

    def perform_update(self, serializer):
        incidente = serializer.save()
        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=self.request.user,
            descripcion=f'Incidente actualizado: [{incidente.estado}] {incidente.titulo}',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'incidente_id': incidente.id,
                'estado': incidente.estado,
            },
        )

    @action(detail=True, methods=['post'])
    def asignar(self, request, pk=None):
        """Asignar investigador al incidente"""
        incidente = self.get_object()
        investigador_id = request.data.get('investigador')
        if not investigador_id:
            return Response({'investigador': 'Debe indicar un investigador.'}, status=400)
        investigador = Usuario.objects.filter(id=investigador_id).first()
        if not investigador:
            return Response({'investigador': 'Usuario no encontrado.'}, status=400)

        incidente.investigador = investigador
        incidente.estado = 'EN_INVESTIGACION'
        incidente.save()

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Incidente {incidente.id} asignado a {investigador.get_full_name()}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'incidente_id': incidente.id, 'investigador_id': investigador.id},
        )

        return Response({
            'status': 'Investigador asignado',
            'incidente': self.get_serializer(incidente).data,
        })

    @action(detail=True, methods=['post'])
    def investigar(self, request, pk=None):
        """Registrar hallazgos de la investigación"""
        incidente = self.get_object()
        causa_raiz = request.data.get('causa_raiz', '')
        acciones_correctivas = request.data.get('acciones_correctivas', '')
        evidencia_urls = request.data.get('evidencia_urls', [])
        resolucion = request.data.get('resolucion', '')

        if not causa_raiz:
            return Response({'causa_raiz': 'Debe documentar la causa raíz.'}, status=400)

        incidente.causa_raiz = causa_raiz
        incidente.acciones_correctivas = acciones_correctivas
        incidente.resolucion = resolucion
        if evidencia_urls:
            incidente.evidencia_urls = list(set(incidente.evidencia_urls + evidencia_urls))
        incidente.estado = 'PENDIENTE_APROBACION'
        incidente.save()

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Investigación completada para incidente {incidente.id}: {incidente.titulo}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'incidente_id': incidente.id},
        )

        return Response({
            'status': 'Investigación registrada, pendiente de aprobación',
            'incidente': self.get_serializer(incidente).data,
        })

    @action(detail=True, methods=['post'])
    def aprobar(self, request, pk=None):
        """Aprobar y cerrar un incidente (solo ADMIN/AUDITOR)"""
        if request.user.rol not in ('ADMIN', 'AUDITOR'):
            return Response({'error': 'Solo administradores o auditores pueden aprobar.'}, status=403)

        incidente = self.get_object()
        if incidente.estado != 'PENDIENTE_APROBACION':
            return Response({'error': 'El incidente no está pendiente de aprobación.'}, status=400)

        notas_aprobacion = request.data.get('notas_aprobacion', '')
        incidente.aprobado_por = request.user
        incidente.estado = 'CERRADO'
        incidente.fecha_resolucion = timezone.now()
        if notas_aprobacion:
            incidente.resolucion = (incidente.resolucion or '') + f'\n\n[Aprobación] {notas_aprobacion}'
        incidente.save()

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Incidente {incidente.id} aprobado y cerrado: {incidente.titulo}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'incidente_id': incidente.id,
                'aprobado_por': request.user.id,
            },
        )

        return Response({
            'status': 'Incidente aprobado y cerrado',
            'incidente': self.get_serializer(incidente).data,
        })

    @action(detail=True, methods=['post'])
    def reabrir(self, request, pk=None):
        """Reabrir un incidente cerrado"""
        if request.user.rol not in ('ADMIN', 'AUDITOR'):
            return Response({'error': 'Solo administradores o auditores pueden reabrir.'}, status=403)

        incidente = self.get_object()
        motivo = request.data.get('motivo', '')
        if not motivo:
            return Response({'motivo': 'Debe indicar el motivo de reapertura.'}, status=400)

        incidente.estado = 'EN_INVESTIGACION'
        incidente.aprobado_por = None
        incidente.fecha_resolucion = None
        incidente.resolucion = (incidente.resolucion or '') + f'\n\n[Reabierto] {motivo}'
        incidente.save()

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Incidente {incidente.id} reabierto: {motivo[:100]}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'incidente_id': incidente.id},
        )

        return Response({
            'status': 'Incidente reabierto',
            'incidente': self.get_serializer(incidente).data,
        })


class InventarioViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet de inventario (solo lectura para paramédicos)"""
    queryset = Inventario.objects.all()
    serializer_class = InventarioSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['caja', 'medicamento']
    search_fields = ['medicamento__nombre', 'lote']


class DashboardViewSet(viewsets.ViewSet):
    """
    Endpoints para el Dashboard Semáforo.
    OPTIMIZADO: usa annotate + Subquery para reducir N+1 queries.
    Antes: ~3N queries (N = # cajas). Ahora: 3 queries totales.
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def semaforo(self, request):
        """Retorna estado del semáforo para todas las cajas — optimizado."""
        from django.db.models import Subquery, OuterRef, IntegerField, BooleanField, Exists
        hoy = timezone.now().date()
        limite_60 = hoy + timedelta(days=60)

        # Subquery: count of items expiring within 60 days
        vencimientos_sq = Inventario.objects.filter(
            caja=OuterRef('pk'),
            fecha_caducidad__lte=limite_60,
            fecha_caducidad__gte=hoy,
        ).values('caja').annotate(cnt=Count('id')).values('cnt')

        # Subquery: count of expired items
        vencidos_sq = Inventario.objects.filter(
            caja=OuterRef('pk'),
            fecha_caducidad__lt=hoy,
        ).values('caja').annotate(cnt=Count('id')).values('cnt')

        # Subquery: has active discrepancy alerts
        discrepancia_sq = Alerta.objects.filter(
            caja_relacionada=OuterRef('pk'),
            tipo='DISCREPANCIA',
            resuelta=False,
        )

        # Single annotated query
        cajas = Caja.objects.annotate(
            vencimientos_30_60=Subquery(vencimientos_sq, output_field=IntegerField()),
            vencidos_count=Subquery(vencidos_sq, output_field=IntegerField()),
            tiene_discrepancia=Exists(discrepancia_sq),
        ).values(
            'id', 'codigo', 'nombre', 'estado',
            'vencimientos_30_60', 'vencidos_count', 'tiene_discrepancia',
        )

        resultado = []
        for caja in cajas:
            venc = caja['vencimientos_30_60'] or 0
            vencidos = caja['vencidos_count'] or 0
            disc = caja['tiene_discrepancia']

            if caja['estado'] == 'EXTRAVIADA' or disc or vencidos > 0:
                color = 'ROJO'
            elif venc > 0:
                color = 'AMARILLO'
            else:
                color = 'VERDE'

            resultado.append({
                'caja_id': caja['id'],
                'caja_codigo': caja['codigo'],
                'caja_nombre': caja['nombre'],
                'color': color,
                'discrepancia': disc,
                'vencimientos_30_60': venc,
                'vencidos': vencidos,
                'estado_caja': caja['estado'],
            })

        return Response(resultado)

    @action(detail=False, methods=['get'])
    def estadisticas(self, request):
        """Estadísticas generales para el dashboard"""
        hoy = timezone.now().date()

        stats = {
            'total_medicamentos': Medicamento.objects.filter(activo=True).count(),
            'total_cajas': Caja.objects.count(),
            'cajas_extraviadas': Caja.objects.filter(estado='EXTRAVIADA').count(),
            'alertas_activas': Alerta.objects.filter(resuelta=False).count(),
            'alertas_criticas': Alerta.objects.filter(resuelta=False, severidad='CRITICA').count(),
            'transacciones_hoy': Transaccion.objects.filter(
                timestamp__date=hoy
            ).count(),
            'licencias_por_vencer': Usuario.objects.filter(
                fecha_vencimiento_licencia__lte=hoy + timedelta(days=30),
                fecha_vencimiento_licencia__gte=hoy
            ).count(),
            'licencias_vencidas': Usuario.objects.filter(
                fecha_vencimiento_licencia__lt=hoy
            ).count(),
        }
        return Response(stats)


class ReporteViewSet(viewsets.ViewSet):
    """Generación de reportes para auditorías DEA/EMS y cumplimiento"""
    permission_classes = [IsAuthenticated]

    def _filtrar_transacciones(self, request, solo_narcoticos=False):
        qs = Transaccion.objects.select_related(
            'usuario', 'testigo', 'medicamento', 'caja_origen', 'caja_destino'
        )
        p = request.query_params
        if p.get('caja'):
            caja_id = p['caja']
            qs = qs.filter(Q(caja_origen_id=caja_id) | Q(caja_destino_id=caja_id))
        if p.get('unidad'):
            qs = qs.filter(
                Q(caja_origen__unidad=p['unidad']) | Q(caja_destino__unidad=p['unidad'])
            )
        if p.get('medicamento'):
            qs = qs.filter(medicamento_id=p['medicamento'])
        if p.get('lote'):
            qs = qs.filter(lote=p['lote'])
        if p.get('usuario'):
            qs = qs.filter(usuario_id=p['usuario'])
        if p.get('testigo'):
            qs = qs.filter(testigo_id=p['testigo'])
        if p.get('tipo'):
            qs = qs.filter(tipo=p['tipo'])
        if p.get('paciente'):
            qs = qs.filter(paciente_id__icontains=p['paciente'])
        if p.get('fecha_inicio'):
            qs = qs.filter(timestamp__date__gte=p['fecha_inicio'])
        if p.get('fecha_fin'):
            qs = qs.filter(timestamp__date__lte=p['fecha_fin'])
        if solo_narcoticos:
            qs = qs.filter(medicamento__tipo='NARCOTICO')
        return qs.order_by('timestamp')

    def _tabla_style(self):
        return TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4f8')]),
        ])

    @action(detail=False, methods=['get'])
    def dea_pdf(self, request):
        """Reporte PDF DEA completo: inventario, transacciones, discrepancias, hash"""
        import hashlib
        qs = self._filtrar_transacciones(request, solo_narcoticos=True)
        caja_id = request.query_params.get('caja')
        ahora = timezone.now()

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="reporte_dea_{ahora.strftime("%Y%m%d_%H%M")}.pdf"'
        )

        doc = SimpleDocTemplate(response, pagesize=letter,
                                leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
        elements = []
        styles = getSampleStyleSheet()

        elements.append(Paragraph(
            "REPORTE DE AUDITORÍA DEA — CONTROL DE NARCÓTICOS", styles['Title']
        ))
        elements.append(Paragraph(
            f"Generado: {ahora.strftime('%Y-%m-%d %H:%M:%S')} | "
            f"Usuario: {request.user.get_full_name()} | "
            f"Período: {request.query_params.get('fecha_inicio', 'inicio')} a "
            f"{request.query_params.get('fecha_fin', 'hoy')}",
            styles['Normal']
        ))
        elements.append(Spacer(1, 12))

        # Inventory snapshot
        if caja_id:
            inv_items = Inventario.objects.filter(
                caja_id=caja_id, medicamento__tipo='NARCOTICO'
            ).select_related('medicamento', 'caja')
            if inv_items.exists():
                elements.append(Paragraph("INVENTARIO ACTUAL DE NARCÓTICOS", styles['Heading2']))
                inv_data = [['Medicamento', 'NDC', 'Lote', 'Cantidad', 'Vencimiento', 'Caja']]
                for inv in inv_items:
                    inv_data.append([
                        inv.medicamento.nombre,
                        formatear_ndc(inv.medicamento.ndc) or '-',
                        inv.lote or '-',
                        str(inv.cantidad),
                        str(inv.fecha_caducidad) if inv.fecha_caducidad else '-',
                        inv.caja.codigo,
                    ])
                t = Table(inv_data, repeatRows=1)
                t.setStyle(self._tabla_style())
                elements.append(t)
                elements.append(Spacer(1, 12))

        # Discrepancies from recent shifts
        if caja_id:
            turnos_con_disc = Turno.objects.filter(
                caja_id=caja_id
            ).exclude(discrepancias=[]).order_by('-fecha_inicio')[:10]
            if turnos_con_disc.exists():
                elements.append(Paragraph("DISCREPANCIAS EN TURNOS RECIENTES", styles['Heading2']))
                disc_data = [['Fecha', 'Usuario', 'Medicamento', 'Esperado', 'Físico', 'Diferencia']]
                for turno in turnos_con_disc:
                    for d in turno.discrepancias:
                        disc_data.append([
                            turno.fecha_inicio.strftime('%Y-%m-%d %H:%M') if turno.fecha_inicio else '-',
                            turno.usuario.get_full_name(),
                            d.get('medicamento_nombre', '-'),
                            str(d.get('cantidad_esperada', '-')),
                            str(d.get('cantidad_fisica', '-')),
                            f"{d.get('diferencia', 0):+d}",
                        ])
                t = Table(disc_data, repeatRows=1)
                t.setStyle(self._tabla_style())
                elements.append(t)
                elements.append(Spacer(1, 12))

        # Transactions
        transacciones = list(qs[:2000])
        elements.append(Paragraph(
            f"TRANSACCIONES DE NARCÓTICOS ({len(transacciones)} registros)", styles['Heading2']
        ))
        if transacciones:
            tx_data = [['Fecha', 'Hash', 'Tipo', 'Usuario', 'Testigo', 'Medicamento', 'NDC', 'Cant.', 'Lote', 'Paciente']]
            for t in transacciones:
                tx_data.append([
                    t.timestamp.strftime('%Y-%m-%d %H:%M'),
                    t.hash_transaccion[:12],
                    t.tipo,
                    t.usuario.get_full_name() or t.usuario.username,
                    t.testigo.get_full_name() if t.testigo else '-',
                    t.medicamento.nombre,
                    formatear_ndc(t.medicamento.ndc) or '-',
                    str(t.cantidad),
                    t.lote or '-',
                    t.paciente_id[:10] if t.paciente_id else '-',
                ])
            tbl = Table(tx_data, repeatRows=1)
            tbl.setStyle(self._tabla_style())
            elements.append(tbl)
        else:
            elements.append(Paragraph("No se encontraron transacciones.", styles['Normal']))

        # Document hash
        hash_input = '|'.join([t.hash_transaccion for t in transacciones])
        doc_hash = hashlib.sha256(
            f'{hash_input}|{ahora.isoformat()}|{request.user.id}'.encode()
        ).hexdigest()
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(
            f"Hash de verificación del documento: {doc_hash}", styles['Normal']
        ))
        elements.append(Paragraph(
            "Este hash permite verificar la integridad del reporte. "
            "Ref: 21 CFR 1304.04, 21 CFR 1304.21", styles['Normal']
        ))

        doc.build(elements)

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=request.user,
            descripcion=f'Reporte DEA PDF generado: {len(transacciones)} transacciones, hash={doc_hash[:16]}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'doc_hash': doc_hash,
                'transacciones': len(transacciones),
                'filtros': dict(request.query_params),
            },
        )

        return response

    @action(detail=False, methods=['get'])
    def csv_transacciones(self, request):
        """Export CSV de transacciones con todos los filtros disponibles"""
        import csv
        solo_narcoticos = request.query_params.get('solo_narcoticos', '').lower() == 'true'
        qs = self._filtrar_transacciones(request, solo_narcoticos=solo_narcoticos)

        ahora = timezone.now()
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="transacciones_{ahora.strftime("%Y%m%d_%H%M")}.csv"'
        )
        response.write('﻿')

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Hash', 'Fecha', 'Tipo', 'Usuario', 'Testigo',
            'Medicamento', 'NDC', 'Tipo Med.', 'Schedule DEA', 'Cantidad', 'Lote',
            'Fecha Caducidad', 'Caja Origen', 'Caja Destino', 'Paciente ID', 'Motivo',
            'Firma Usuario', 'Firma Testigo',
        ])

        for t in qs[:5000]:
            writer.writerow([
                t.id,
                t.hash_transaccion,
                t.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                t.tipo,
                t.usuario.get_full_name() or t.usuario.username,
                t.testigo.get_full_name() if t.testigo else '',
                t.medicamento.nombre,
                formatear_ndc(t.medicamento.ndc),
                t.medicamento.tipo,
                t.medicamento.dea_schedule,
                t.cantidad,
                t.lote,
                t.fecha_caducidad.isoformat() if t.fecha_caducidad else '',
                t.caja_origen.codigo if t.caja_origen else '',
                t.caja_destino.codigo if t.caja_destino else '',
                t.paciente_id,
                t.motivo,
                'Sí' if t.firma_usuario else 'No',
                'Sí' if t.firma_testigo else 'No',
            ])

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=request.user,
            descripcion=f'Reporte CSV exportado: hasta 5000 transacciones',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'filtros': dict(request.query_params)},
        )

        return response

    @action(detail=False, methods=['get'])
    def actividad(self, request):
        """Reporte JSON de actividad con estadísticas por período"""
        p = request.query_params
        fecha_inicio = p.get('fecha_inicio')
        fecha_fin = p.get('fecha_fin')

        qs = Transaccion.objects.all()
        if fecha_inicio:
            qs = qs.filter(timestamp__date__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(timestamp__date__lte=fecha_fin)

        por_tipo = qs.values('tipo').annotate(total=Count('id'), cantidad_total=Sum('cantidad'))
        por_usuario = qs.values('usuario__username', 'usuario__first_name', 'usuario__last_name').annotate(
            total=Count('id')
        ).order_by('-total')[:20]
        por_medicamento = qs.filter(medicamento__tipo='NARCOTICO').values(
            'medicamento__nombre'
        ).annotate(total=Count('id'), cantidad_total=Sum('cantidad')).order_by('-cantidad_total')

        alertas_periodo = Alerta.objects.all()
        if fecha_inicio:
            alertas_periodo = alertas_periodo.filter(timestamp__date__gte=fecha_inicio)
        if fecha_fin:
            alertas_periodo = alertas_periodo.filter(timestamp__date__lte=fecha_fin)

        incidentes_periodo = Incidente.objects.all()
        if fecha_inicio:
            incidentes_periodo = incidentes_periodo.filter(fecha_creacion__date__gte=fecha_inicio)
        if fecha_fin:
            incidentes_periodo = incidentes_periodo.filter(fecha_creacion__date__lte=fecha_fin)

        return Response({
            'transacciones_por_tipo': list(por_tipo),
            'transacciones_por_usuario': list(por_usuario),
            'narcoticos_por_medicamento': list(por_medicamento),
            'alertas': {
                'total': alertas_periodo.count(),
                'criticas': alertas_periodo.filter(severidad='CRITICA').count(),
                'resueltas': alertas_periodo.filter(resuelta=True).count(),
                'pendientes': alertas_periodo.filter(resuelta=False).count(),
            },
            'incidentes': {
                'total': incidentes_periodo.count(),
                'abiertos': incidentes_periodo.filter(estado='ABIERTO').count(),
                'cerrados': incidentes_periodo.filter(estado='CERRADO').count(),
            },
        })

    @action(detail=False, methods=['get'])
    def audit_log(self, request):
        """Reporte de log de auditoría con filtros"""
        p = request.query_params
        qs = SystemLog.objects.all()
        if p.get('categoria'):
            qs = qs.filter(categoria=p['categoria'])
        if p.get('usuario'):
            qs = qs.filter(usuario_id=p['usuario'])
        if p.get('fecha_inicio'):
            qs = qs.filter(timestamp__date__gte=p['fecha_inicio'])
        if p.get('fecha_fin'):
            qs = qs.filter(timestamp__date__lte=p['fecha_fin'])

        logs = qs.select_related('usuario')[:500]
        data = []
        for log in logs:
            data.append({
                'id': log.id,
                'categoria': log.categoria,
                'usuario': log.usuario.get_full_name() if log.usuario else '-',
                'descripcion': log.descripcion,
                'ip_address': log.ip_address,
                'metadata': log.metadata,
                'timestamp': log.timestamp.isoformat(),
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def caducidades(self, request):
        """Reporte de medicamentos próximos a vencer"""
        dias = int(request.query_params.get('dias', 60))
        fecha_limite = timezone.now().date() + timedelta(days=dias)

        inventarios = Inventario.objects.filter(
            fecha_caducidad__lte=fecha_limite,
            fecha_caducidad__gte=timezone.now().date()
        ).select_related('medicamento', 'caja')

        data = []
        for inv in inventarios:
            data.append({
                'medicamento': inv.medicamento.nombre,
                'tipo': inv.medicamento.tipo,
                'ndc': formatear_ndc(inv.medicamento.ndc),
                'lote': inv.lote,
                'caja': inv.caja.codigo,
                'unidad': inv.caja.unidad,
                'cantidad': inv.cantidad,
                'fecha_caducidad': inv.fecha_caducidad,
                'dias_restantes': (inv.fecha_caducidad - timezone.now().date()).days,
            })

        return Response(data)

    @action(detail=False, methods=['get'])
    def verificar_cadena(self, request):
        """Verifica integridad de la cadena criptográfica de transacciones"""
        if request.user.rol not in ('ADMIN', 'AUDITOR'):
            return Response({'error': 'Solo ADMIN o AUDITOR pueden verificar la cadena.'}, status=403)

        limit = request.query_params.get('limit')
        resultado = Transaccion.verificar_cadena(limit=int(limit) if limit else None)

        SystemLog.objects.create(
            categoria='ALERTA',
            usuario=request.user,
            descripcion=f'Verificación de cadena: {"VÁLIDA" if resultado["valida"] else "INVÁLIDA"} '
                        f'({resultado["verificadas"]} transacciones, {len(resultado["errores"])} errores)',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata=resultado,
        )

        return Response(resultado)


class UsuarioViewSet(viewsets.ModelViewSet):
    """ViewSet de usuarios (CRUD completo, escrituras restringidas a ADMIN)"""
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'desbloquear']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        """Retorna datos del usuario autenticado"""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    def _log_usuario_change(self, action_desc, usuario):
        SystemLog.objects.create(
            categoria='CONFIG',
            usuario=self.request.user,
            descripcion=f'{action_desc}: {usuario.username} (rol={usuario.rol})',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'usuario_id': usuario.id,
                'username': usuario.username,
                'rol': usuario.rol,
                'activo': usuario.activo,
            }
        )

    def perform_create(self, serializer):
        user = serializer.save()
        self._log_usuario_change('Usuario creado', user)

    def perform_update(self, serializer):
        user = serializer.save()
        self._log_usuario_change('Usuario actualizado', user)

    def perform_destroy(self, instance):
        self._log_usuario_change('Usuario eliminado', instance)
        instance.delete()

    @action(detail=True, methods=['post'])
    def desbloquear(self, request, pk=None):
        """Desbloquea un usuario bloqueado (solo ADMIN)"""
        usuario = self.get_object()
        if not usuario.bloqueado_permanente and not usuario.bloqueado_hasta:
            return Response({'detail': 'El usuario no esta bloqueado.'}, status=400)

        usuario.desbloquear()

        SystemLog.objects.create(
            categoria='CONFIG',
            usuario=request.user,
            descripcion=f'Usuario desbloqueado: {usuario.username} por {request.user.username}',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'usuario_desbloqueado_id': usuario.id, 'username': usuario.username},
        )

        return Response({'detail': f'Usuario {usuario.username} desbloqueado exitosamente.'})



class MedicamentoViewSet(viewsets.ModelViewSet):
    """Catálogo de medicamentos (CRUD completo, escrituras restringidas a ADMIN)"""
    serializer_class = MedicamentoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['tipo', 'requiere_doble_factor', 'activo']
    search_fields = ['nombre', 'principio_activo', 'codigo_barras']

    def get_queryset(self):
        if self.request.user.rol == 'ADMIN':
            return Medicamento.objects.all()
        return Medicamento.objects.filter(activo=True)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]

    def _log_medicamento_change(self, action_desc, medicamento):
        SystemLog.objects.create(
            categoria='CONFIG',
            usuario=self.request.user,
            descripcion=f'{action_desc}: {medicamento.nombre} ({medicamento.tipo})',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'medicamento_id': medicamento.id,
                'tipo': medicamento.tipo,
                'activo': medicamento.activo,
                'requiere_doble_factor': medicamento.requiere_doble_factor,
            }
        )

    def perform_create(self, serializer):
        med = serializer.save()
        self._log_medicamento_change('Medicamento creado', med)

    def perform_update(self, serializer):
        med = serializer.save()
        self._log_medicamento_change('Medicamento actualizado', med)

    @action(detail=False, methods=['get'], url_path='ndc-lookup')
    def ndc_lookup(self, request):
        """
        Verifica un NDC contra el FDA NDC Directory (openFDA) y devuelve
        los datos del producto para autocompletar el catálogo.
        """
        from core.fda import FDAServicioNoDisponible, consultar_ndc
        from core.ndc import NDCInvalido, normalizar_ndc

        valor = request.query_params.get('ndc', '')
        try:
            ndc11 = normalizar_ndc(valor)
        except NDCInvalido as e:
            return Response({'ndc': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            info = consultar_ndc(ndc11)
        except FDAServicioNoDisponible:
            return Response({
                'encontrado': False,
                'verificado': False,
                'ndc': ndc11,
                'ndc_formateado': formatear_ndc(ndc11),
                'mensaje': 'El directorio de la FDA no está disponible en este momento. '
                           'El NDC tiene formato válido y puede registrarse; '
                           'verifíquelo cuando haya conexión.',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if info is None:
            return Response({
                'encontrado': False,
                'verificado': True,
                'ndc': ndc11,
                'ndc_formateado': formatear_ndc(ndc11),
                'mensaje': 'Este NDC no aparece en el directorio de la FDA. '
                           'Verifique el número en el empaque antes de registrarlo.',
            })

        return Response(info)

    def perform_destroy(self, instance):
        if instance.inventarios.exists() or instance.transacciones.exists():
            raise drf_serializers.ValidationError(
                {'detail': 'No se puede eliminar un medicamento con inventario o transacciones. Desactívelo en su lugar.'}
            )
        self._log_medicamento_change('Medicamento eliminado', instance)
        instance.delete()


class CajaViewSet(viewsets.ModelViewSet):
    """Cajas de medicamentos con cadena de custodia"""
    queryset = Caja.objects.all()
    serializer_class = CajaSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]

    def _log_caja_change(self, action_desc, caja):
        SystemLog.objects.create(
            categoria='CONFIG',
            usuario=self.request.user,
            descripcion=f'{action_desc}: {caja.codigo} ({caja.estado})',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'caja_id': caja.id,
                'codigo': caja.codigo,
                'estado': caja.estado,
                'unidad': caja.unidad,
            }
        )

    def perform_create(self, serializer):
        caja = serializer.save()
        self._log_caja_change('Caja creada', caja)

    def perform_update(self, serializer):
        old_estado = self.get_object().estado
        caja = serializer.save()
        self._log_caja_change('Caja actualizada', caja)

        if caja.estado == 'EXTRAVIADA' and old_estado != 'EXTRAVIADA':
            Alerta.objects.create(
                tipo='CAJA_EXTRAVIADA',
                severidad='CRITICA',
                titulo=f'Caja marcada como extraviada: {caja.codigo}',
                descripcion=(
                    f'La caja {caja.codigo} ({caja.nombre}) fue marcada como EXTRAVIADA '
                    f'por {self.request.user.get_full_name()}. Unidad: {caja.unidad}.'
                ),
                caja_relacionada=caja,
                usuario_relacionado=self.request.user,
            )

    def perform_destroy(self, instance):
        self._log_caja_change('Caja eliminada', instance)
        instance.delete()

    @action(detail=True, methods=['post'])
    def checkout(self, request, pk=None):
        """Registrar checkout de caja con conteo físico"""
        caja = self.get_object()
        usuario_destino = request.user
        firma_destino = request.data.get('firma_destino', '')
        conteo_fisico = request.data.get('conteo_fisico', [])
        notas = request.data.get('notas', '')

        if not firma_destino:
            return Response({'firma_destino': 'Firma requerida para checkout.'}, status=400)

        snapshot = capturar_snapshot(caja)
        if not conteo_fisico:
            conteo_fisico = snapshot

        discrepancias = calcular_discrepancias(snapshot, conteo_fisico)

        custodia = CustodiaCaja.objects.create(
            caja=caja,
            tipo='CHECKOUT',
            usuario_origen=caja.responsable if caja.responsable != usuario_destino else None,
            usuario_destino=usuario_destino,
            snapshot_contenido=snapshot,
            conteo_fisico=conteo_fisico,
            discrepancias=discrepancias,
            firma_origen=request.data.get('firma_origen', ''),
            firma_destino=firma_destino,
            notas=notas,
        )

        caja.responsable = usuario_destino
        caja.estado = 'EN_TRANSITO'
        caja.save()

        for d in discrepancias:
            Alerta.objects.create(
                tipo='DISCREPANCIA',
                severidad='CRITICA' if d['medicamento_tipo'] == 'NARCOTICO' else 'ALTA',
                titulo=f'Discrepancia en checkout: {d["medicamento_nombre"]}',
                descripcion=(
                    f'Checkout caja {caja.codigo}: conteo físico ({d["cantidad_fisica"]}) '
                    f'difiere del sistema ({d["cantidad_esperada"]}) para '
                    f'{d["medicamento_nombre"]} lote {d["lote"]}. '
                    f'Diferencia: {d["diferencia"]:+d}. '
                    f'Recibida por {usuario_destino.get_full_name()}.'
                ),
                caja_relacionada=caja,
                usuario_relacionado=usuario_destino,
            )

        self._generar_alertas_vencimiento(caja, snapshot)

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=request.user,
            descripcion=f'Checkout caja {caja.codigo}: {len(snapshot)} items, {len(discrepancias)} discrepancias',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'custodia_id': custodia.id,
                'caja_id': caja.id,
                'discrepancias': len(discrepancias),
            },
        )

        return Response({
            'status': 'Checkout registrado',
            'custodia_id': custodia.id,
            'discrepancias': discrepancias,
        })

    @action(detail=True, methods=['post'])
    def checkin(self, request, pk=None):
        """Registrar checkin de caja con conteo físico"""
        caja = self.get_object()
        firma_origen = request.data.get('firma_origen', '')
        conteo_fisico = request.data.get('conteo_fisico', [])
        notas = request.data.get('notas', '')
        nuevo_responsable_id = request.data.get('nuevo_responsable')

        if not firma_origen:
            return Response({'firma_origen': 'Firma requerida para checkin.'}, status=400)

        snapshot = capturar_snapshot(caja)
        if not conteo_fisico:
            conteo_fisico = snapshot

        discrepancias = calcular_discrepancias(snapshot, conteo_fisico)

        nuevo_responsable = None
        if nuevo_responsable_id:
            nuevo_responsable = Usuario.objects.filter(id=nuevo_responsable_id).first()

        custodia = CustodiaCaja.objects.create(
            caja=caja,
            tipo='CHECKIN',
            usuario_origen=request.user,
            usuario_destino=nuevo_responsable or caja.responsable,
            snapshot_contenido=snapshot,
            conteo_fisico=conteo_fisico,
            discrepancias=discrepancias,
            firma_origen=firma_origen,
            firma_destino=request.data.get('firma_destino', ''),
            notas=notas,
        )

        if nuevo_responsable:
            caja.responsable = nuevo_responsable
        caja.estado = 'ACTIVA'
        caja.save()

        for d in discrepancias:
            Alerta.objects.create(
                tipo='DISCREPANCIA',
                severidad='CRITICA' if d['medicamento_tipo'] == 'NARCOTICO' else 'ALTA',
                titulo=f'Discrepancia en checkin: {d["medicamento_nombre"]}',
                descripcion=(
                    f'Checkin caja {caja.codigo}: conteo físico ({d["cantidad_fisica"]}) '
                    f'difiere del sistema ({d["cantidad_esperada"]}) para '
                    f'{d["medicamento_nombre"]} lote {d["lote"]}. '
                    f'Diferencia: {d["diferencia"]:+d}. '
                    f'Entregada por {request.user.get_full_name()}.'
                ),
                caja_relacionada=caja,
                usuario_relacionado=request.user,
            )

        self._generar_alertas_vencimiento(caja, snapshot)

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=request.user,
            descripcion=f'Checkin caja {caja.codigo}: {len(snapshot)} items, {len(discrepancias)} discrepancias',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'custodia_id': custodia.id,
                'caja_id': caja.id,
                'discrepancias': len(discrepancias),
            },
        )

        return Response({
            'status': 'Checkin registrado',
            'custodia_id': custodia.id,
            'discrepancias': discrepancias,
        })

    @action(detail=True, methods=['get'])
    def historial_custodia(self, request, pk=None):
        """Historial completo de custodia de una caja"""
        caja = self.get_object()
        custodias = CustodiaCaja.objects.filter(caja=caja).select_related(
            'usuario_origen', 'usuario_destino'
        )
        serializer = CustodiaCajaSerializer(custodias, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def snapshot_actual(self, request, pk=None):
        """Snapshot actual del contenido de la caja"""
        caja = self.get_object()
        return Response(capturar_snapshot(caja))

    def _generar_alertas_vencimiento(self, caja, snapshot):
        hoy = timezone.now().date()
        for item in snapshot:
            if not item['fecha_caducidad']:
                continue
            from datetime import date
            fecha = date.fromisoformat(item['fecha_caducidad'])
            dias = (fecha - hoy).days
            if dias < 0:
                Alerta.objects.get_or_create(
                    tipo='VENCIDO',
                    caja_relacionada=caja,
                    descripcion__contains=item['medicamento_nombre'],
                    defaults={
                        'severidad': 'CRITICA',
                        'titulo': f'Medicamento vencido: {item["medicamento_nombre"]}',
                        'descripcion': (
                            f'{item["medicamento_nombre"]} lote {item["lote"]} en caja '
                            f'{caja.codigo} venció el {item["fecha_caducidad"]}. '
                            f'Cantidad: {item["cantidad"]}.'
                        ),
                    }
                )
            elif dias <= 60:
                Alerta.objects.get_or_create(
                    tipo='VENCIMIENTO',
                    caja_relacionada=caja,
                    descripcion__contains=item['medicamento_nombre'],
                    resuelta=False,
                    defaults={
                        'severidad': 'ALTA' if dias <= 30 else 'MEDIA',
                        'titulo': f'Próximo a vencer: {item["medicamento_nombre"]}',
                        'descripcion': (
                            f'{item["medicamento_nombre"]} lote {item["lote"]} en caja '
                            f'{caja.codigo} vence el {item["fecha_caducidad"]} '
                            f'({dias} días). Cantidad: {item["cantidad"]}.'
                        ),
                    }
                )


class TurnoViewSet(viewsets.ModelViewSet):
    """Gestión de turnos con snapshots de inventario y detección de discrepancias"""
    queryset = Turno.objects.all()
    serializer_class = TurnoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.rol == 'PARAMEDICO':
            return Turno.objects.filter(usuario=user)
        return Turno.objects.all()

    def perform_create(self, serializer):
        user = self.request.user
        caja_id = serializer.validated_data['caja'].id

        # Prevent checkout of a box already in an active shift by another user
        turno_existente = Turno.objects.filter(caja_id=caja_id, activo=True).exclude(usuario=user).first()
        if turno_existente:
            raise drf_serializers.ValidationError({
                'caja': f'Esta caja está asignada al turno activo de {turno_existente.usuario.get_full_name()}.'
            })

        # Close any prior active shift for this user
        Turno.objects.filter(usuario=user, activo=True).update(
            activo=False, fecha_fin=timezone.now()
        )

        caja = Caja.objects.get(id=caja_id)
        snapshot = capturar_snapshot(caja)
        conteo_fisico = self.request.data.get('conteo_fisico_inicial', snapshot)

        turno = serializer.save(
            usuario=user,
            snapshot_inicial=snapshot,
            conteo_fisico_inicial=conteo_fisico,
        )

        # Detect initial discrepancies
        disc_iniciales = calcular_discrepancias(snapshot, conteo_fisico)
        if disc_iniciales:
            for d in disc_iniciales:
                Alerta.objects.create(
                    tipo='DISCREPANCIA',
                    severidad='ALTA' if d['medicamento_tipo'] == 'NARCOTICO' else 'MEDIA',
                    titulo=f'Discrepancia al inicio de turno: {d["medicamento_nombre"]}',
                    descripcion=(
                        f'Conteo físico ({d["cantidad_fisica"]}) difiere del sistema '
                        f'({d["cantidad_esperada"]}) para {d["medicamento_nombre"]} '
                        f'lote {d["lote"]}. Diferencia: {d["diferencia"]:+d}.'
                    ),
                    usuario_relacionado=user,
                    caja_relacionada=caja,
                )

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=user,
            descripcion=f'Turno iniciado: caja {caja.codigo}, {len(snapshot)} items, {len(disc_iniciales)} discrepancias iniciales',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={'turno_id': turno.id, 'caja_id': caja.id, 'discrepancias_iniciales': len(disc_iniciales)},
        )

    @action(detail=False, methods=['get'])
    def actual(self, request):
        """Retorna el turno activo del usuario autenticado"""
        turno = Turno.objects.filter(usuario=request.user, activo=True).select_related('caja').first()
        if not turno:
            return Response({'turno': None})
        return Response({'turno': self.get_serializer(turno).data})

    @action(detail=False, methods=['post'])
    def cerrar_actual(self, request):
        """Cierra el turno activo con conteo final y detección de discrepancias"""
        turno = Turno.objects.filter(usuario=request.user, activo=True).select_related('caja').first()
        if not turno:
            return Response({'error': 'No hay turno activo'}, status=400)

        firma_cierre = request.data.get('firma_cierre', '')
        conteo_final_confirmado = request.data.get('conteo_final_confirmado', False)
        notas_cierre = request.data.get('notas_cierre', '')
        conteo_fisico_final = request.data.get('conteo_fisico_final', [])

        if not conteo_final_confirmado:
            return Response({'conteo_final_confirmado': 'Debe confirmar el conteo final de la caja.'}, status=400)
        if not firma_cierre:
            return Response({'firma_cierre': 'Firma de cierre requerida.'}, status=400)

        snapshot_final = capturar_snapshot(turno.caja)
        if not conteo_fisico_final:
            conteo_fisico_final = snapshot_final

        discrepancias = calcular_discrepancias(snapshot_final, conteo_fisico_final)

        for d in discrepancias:
            Alerta.objects.create(
                tipo='DISCREPANCIA',
                severidad='CRITICA' if d['medicamento_tipo'] == 'NARCOTICO' else 'ALTA',
                titulo=f'Discrepancia al cierre de turno: {d["medicamento_nombre"]}',
                descripcion=(
                    f'Conteo físico ({d["cantidad_fisica"]}) difiere del sistema '
                    f'({d["cantidad_esperada"]}) para {d["medicamento_nombre"]} '
                    f'lote {d["lote"]}. Diferencia: {d["diferencia"]:+d}. '
                    f'Turno de {request.user.get_full_name()}, caja {turno.caja.codigo}.'
                ),
                usuario_relacionado=request.user,
                caja_relacionada=turno.caja,
            )

        turno.finalizar(
            firma_cierre=firma_cierre,
            conteo_final_confirmado=conteo_final_confirmado,
            notas_cierre=notas_cierre,
            conteo_fisico_final=conteo_fisico_final,
            snapshot_final=snapshot_final,
            discrepancias=discrepancias,
        )

        SystemLog.objects.create(
            categoria='TRANSACCION',
            usuario=request.user,
            descripcion=f'Turno cerrado: caja {turno.caja.codigo}, {len(discrepancias)} discrepancias finales',
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'turno_id': turno.id,
                'caja_id': turno.caja.id,
                'discrepancias': len(discrepancias),
                'waste': turno.contador_waste,
                'administrations': turno.contador_administration,
            },
        )

        return Response({
            'status': 'Turno cerrado',
            'turno_id': turno.id,
            'discrepancias': discrepancias,
        })


class UnidadViewSet(viewsets.ModelViewSet):
    """Gestión de unidades asignadas (CRUD completo, escrituras restringidas a ADMIN)"""
    queryset = Unidad.objects.all()
    serializer_class = UnidadSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]

    def _log_unidad_change(self, action_desc, unidad):
        SystemLog.objects.create(
            categoria='CONFIG',
            usuario=self.request.user,
            descripcion=f'{action_desc}: {unidad.nombre}',
            ip_address=self.request.META.get('REMOTE_ADDR'),
            metadata={
                'unidad_id': unidad.id,
                'nombre': unidad.nombre,
                'activa': unidad.activa,
            }
        )

    def perform_create(self, serializer):
        unidad = serializer.save()
        self._log_unidad_change('Unidad creada', unidad)

    def perform_update(self, serializer):
        unidad = serializer.save()
        self._log_unidad_change('Unidad actualizada', unidad)

    def perform_destroy(self, instance):
        self._log_unidad_change('Unidad eliminada', instance)
        instance.delete()


class BaseViewSet(viewsets.ModelViewSet):
    """Gestión de bases operativas (CRUD completo, escrituras restringidas a ADMIN)"""
    queryset = Base.objects.all().order_by('nombre')
    serializer_class = BaseSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]


class TurnoConfigViewSet(viewsets.ModelViewSet):
    """Gestión de plantillas de turno (horarios) — solo ADMIN"""
    queryset = TurnoConfig.objects.all().order_by('hora_inicio')
    serializer_class = TurnoConfigSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSystemAdmin()]
        return [IsAuthenticated()]


class ProtocoloAcuseViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                            viewsets.GenericViewSet):
    """
    Acuses de lectura de protocolos.
    - POST: el usuario autenticado registra que leyó un protocolo (idempotente)
    - GET: ADMIN/AUDITOR ven todos; los demás solo los propios
    """
    serializer_class = ProtocoloAcuseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['protocolo', 'version']

    def get_queryset(self):
        qs = ProtocoloAcuse.objects.select_related('usuario')
        if self.request.user.rol in ('ADMIN', 'AUDITOR'):
            return qs
        return qs.filter(usuario=self.request.user)

    def create(self, request, *args, **kwargs):
        protocolo = request.data.get('protocolo', '').strip()
        version = str(request.data.get('version', '1.0')).strip() or '1.0'
        if not protocolo:
            return Response({'protocolo': 'Indique el protocolo.'},
                            status=status.HTTP_400_BAD_REQUEST)

        acuse, creado = ProtocoloAcuse.objects.get_or_create(
            usuario=request.user, protocolo=protocolo, version=version
        )
        if creado:
            SystemLog.objects.create(
                categoria='CONFIG',
                usuario=request.user,
                descripcion=f'Acuse de lectura de protocolo: {protocolo} v{version}',
                ip_address=request.META.get('REMOTE_ADDR'),
                metadata={'protocolo': protocolo, 'version': version},
            )
        serializer = self.get_serializer(acuse)
        return Response(serializer.data,
                        status=status.HTTP_201_CREATED if creado else status.HTTP_200_OK)
