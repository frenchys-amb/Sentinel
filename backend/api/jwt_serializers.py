"""
Custom JWT serializers for XentraSentinel.
Returns user profile data alongside tokens on login.
"""
from django.utils import timezone
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from core.models import Usuario, SystemLog


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends token pair to:
    1. Check account lockout before authentication (PARAMEDICO only)
    2. Track failed login attempts and apply progressive blocking
    3. Add custom claims (rol, licencia) to the JWT payload
    4. Return full user profile alongside tokens
    5. Enforce license checks before issuing tokens
    6. Log successful/failed logins
    """

    def validate(self, attrs):
        username = attrs.get('username', '')
        password = attrs.get('password', '')

        # Pre-check: verify blocking status BEFORE authentication
        try:
            user_check = Usuario.objects.get(username=username)
        except Usuario.DoesNotExist:
            user_check = None

        if user_check:
            # Check permanent block
            if user_check.bloqueado_permanente:
                raise serializers.ValidationError({
                    'detail': 'Su cuenta ha sido bloqueada por multiples intentos fallidos. Contacte al administrador para desbloquearla.',
                    'code': 'ACCOUNT_PERMANENTLY_LOCKED',
                })

            # Check temporary block
            if user_check.bloqueado_hasta and timezone.now() < user_check.bloqueado_hasta:
                segundos = int((user_check.bloqueado_hasta - timezone.now()).total_seconds())
                minutos = max(1, (segundos + 59) // 60)
                raise serializers.ValidationError({
                    'detail': 'Credenciales invalidas.',
                    'code': 'ACCOUNT_LOCKED',
                })

        # Proceed with normal JWT authentication
        try:
            data = super().validate(attrs)
        except serializers.ValidationError:
            # Authentication failed - register failed attempt
            if user_check:
                user_check.registrar_intento_fallido()

                intentos = user_check.intentos_fallidos

                # Log failed attempt
                request = self.context.get('request')
                ip = None
                ua = ''
                if request:
                    ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
                    if ip and ',' in ip:
                        ip = ip.split(',')[0].strip()
                    ua = request.META.get('HTTP_USER_AGENT', '')

                SystemLog.objects.create(
                    categoria='LOGIN_FAIL',
                    usuario=user_check,
                    descripcion=f'Login fallido: {user_check.username} - Intento {intentos}/6',
                    ip_address=ip,
                    user_agent=ua,
                    metadata={'intentos': intentos, 'bloqueado': user_check.esta_bloqueado},
                )
                if user_check.bloqueado_permanente:
                    raise serializers.ValidationError({
                        'detail': 'Credenciales invalidas.',
                        'code': 'ACCOUNT_PERMANENTLY_LOCKED',
                    })
                elif user_check.bloqueado_hasta:
                    raise serializers.ValidationError({
                        'detail': 'Credenciales invalidas.',
                        'code': 'ACCOUNT_LOCKED',
                    })
                else:
                    raise serializers.ValidationError({
                        'detail': 'Credenciales invalidas.',
                        'code': 'INVALID_CREDENTIALS',
                    })
            raise

        user = self.user

        # Clear failed attempts on successful login
        user.limpiar_intentos_fallidos()

        # Block login if license is expired and user is PARAMEDICO
        if user.rol == 'PARAMEDICO' and not user.puede_administrar:
            raise serializers.ValidationError({
                'detail': 'Su licencia está vencida o no tiene licencia asignada. Contacte al administrador.',
                'code': 'LICENSE_INVALID',
            })

        # Block inactive users
        if not user.activo:
            raise serializers.ValidationError({
                'detail': 'Su cuenta está desactivada. Contacte al administrador.',
                'code': 'ACCOUNT_DISABLED',
            })

        # Add user profile to response
        data['user'] = {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'rol': user.rol,
            'numero_licencia': user.numero_licencia,
            'fecha_vencimiento_licencia': str(user.fecha_vencimiento_licencia) if user.fecha_vencimiento_licencia else None,
            'licencia_vigente': user.licencia_vigente,
            'licencia_por_vencer': user.licencia_por_vencer,
            'puede_administrar': user.puede_administrar,
            'telefono': user.telefono,
            'unidad_asignada': user.unidad_asignada,
            'activo': user.activo,
        }

        # Audit log
        request = self.context.get('request')
        ip = None
        ua = ''
        if request:
            ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            ua = request.META.get('HTTP_USER_AGENT', '')

        SystemLog.objects.create(
            categoria='LOGIN',
            usuario=user,
            descripcion=f'Login exitoso: {user.username} ({user.rol})',
            ip_address=ip,
            user_agent=ua,
            metadata={'method': 'JWT', 'rol': user.rol},
        )

        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Custom claims embedded in the JWT
        token['rol'] = user.rol
        token['username'] = user.username
        token['full_name'] = user.get_full_name()
        return token
