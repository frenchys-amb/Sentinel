"""
Middleware de Seguridad Institucional
- AuditLogMiddleware: Registra todas las operaciones críticas
- DualFactorCheckMiddleware: Verifica doble factor para transacciones sensibles
"""
import json
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import SystemLog, Alerta


class AuditLogMiddleware(MiddlewareMixin):
    """
    Registra automáticamente en system_logs:
    - Cambios de IP entre requests
    - Operaciones sobre transacciones
    - Intentos de acceso no autorizado
    """

    def process_request(self, request):
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return None

        # Detectar cambio de IP
        ip_actual = self._get_client_ip(request)
        ip_anterior = request.session.get('last_ip')

        if ip_anterior and ip_anterior != ip_actual:
            SystemLog.objects.create(
                categoria='CONFIG',
                usuario=request.user,
                descripcion=f'Cambio de IP detectado: {ip_anterior} -> {ip_actual}',
                ip_address=ip_actual,
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'ip_anterior': ip_anterior, 'ip_nueva': ip_actual}
            )

        request.session['last_ip'] = ip_actual
        request.ip_address = ip_actual
        request.user_agent = request.META.get('HTTP_USER_AGENT', '')
        return None

    def process_response(self, request, response):
        # Registrar intentos fallidos de autenticación
        if response.status_code == 401 or response.status_code == 403:
            if hasattr(request, 'user') and request.user.is_authenticated:
                SystemLog.objects.create(
                    categoria='INTENTO_ALTERACION',
                    usuario=request.user,
                    descripcion=f'Acceso denegado a {request.path}',
                    ip_address=getattr(request, 'ip_address', None),
                    user_agent=getattr(request, 'user_agent', ''),
                    metadata={'path': request.path, 'method': request.method, 'status': response.status_code}
                )
        return response

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')


class DualFactorCheckMiddleware(MiddlewareMixin):
    """
    Verifica que las transacciones sensibles (narcóticos, descartes)
    incluyan validación de doble factor (firma + testigo).
    Intercepta POST a /api/transacciones/ y valida el body JSON.
    """

    def process_view(self, request, view_func, view_args, view_kwargs):
        # Solo aplicar a creación de transacciones (POST /api/transacciones/)
        if request.method != 'POST' or not request.path.rstrip('/').endswith('/transacciones'):
            return None

        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return None

        # Verificar que el usuario tiene licencia vigente
        if hasattr(request.user, 'puede_administrar') and not request.user.puede_administrar:
            SystemLog.objects.create(
                categoria='ALERTA',
                usuario=request.user,
                descripcion='Intento de transacción con licencia inválida o vencida',
                ip_address=getattr(request, 'ip_address', None),
                metadata={'path': request.path}
            )
            return JsonResponse({
                'error': 'Licencia inválida o vencida. No puede realizar transacciones.',
                'code': 'LICENSE_INVALID'
            }, status=403)

        # Parsear body para verificar tipo y testigo
        try:
            body = json.loads(request.body) if request.body else {}
        except json.JSONDecodeError:
            body = {}

        tipo = body.get('tipo', '')

        # Verificar testigo para descartes (siempre requerido)
        if tipo == 'WASTE' and not body.get('testigo'):
            SystemLog.objects.create(
                categoria='INTENTO_ALTERACION',
                usuario=request.user,
                descripcion='Intento de descarte sin testigo',
                ip_address=getattr(request, 'ip_address', None),
                metadata={'tipo': tipo}
            )
            return JsonResponse({
                'error': 'Descarte requiere testigo obligatorio. Sin testigo, no hay descarte.',
                'code': 'WITNESS_REQUIRED'
            }, status=403)

        # Verificar firma digital
        if not body.get('firma_usuario'):
            return JsonResponse({
                'error': 'Firma digital requerida para esta transacción.',
                'code': 'SIGNATURE_REQUIRED'
            }, status=403)

        return None
