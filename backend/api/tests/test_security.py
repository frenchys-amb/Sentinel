"""
Tests for authentication, authorization, JWT lifecycle, and security boundaries.
"""
from datetime import timedelta
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from core.models import SystemLog
from .test_base import BaseAPITestCase


class JWTAuthenticationTests(BaseAPITestCase):
    """Tests for JWT login, refresh, logout, and expiration."""

    def test_login_returns_tokens_and_user(self):
        client = self.get_anon_client()
        res = client.post('/api/auth/login/', {
            'username': 'para_test',
            'password': 'SecurePass123!',
        })
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertIn('user', res.data)
        self.assertEqual(res.data['user']['rol'], 'PARAMEDICO')

    def test_login_with_wrong_password(self):
        client = self.get_anon_client()
        res = client.post('/api/auth/login/', {
            'username': 'para_test',
            'password': 'WrongPassword!',
        })
        self.assertEqual(res.status_code, 401)

    def test_login_expired_license_blocked(self):
        client = self.get_anon_client()
        res = client.post('/api/auth/login/', {
            'username': 'expired_test',
            'password': 'SecurePass123!',
        })
        self.assertEqual(res.status_code, 400)

    def test_refresh_token_returns_new_access(self):
        client = self.get_anon_client()
        login = client.post('/api/auth/login/', {
            'username': 'admin_test',
            'password': 'SecurePass123!',
        })
        refresh = login.data['refresh']
        res = client.post('/api/auth/token/refresh/', {'refresh': refresh})
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)

    def test_logout_blacklists_refresh(self):
        client = self.get_anon_client()
        login = client.post('/api/auth/login/', {
            'username': 'admin_test',
            'password': 'SecurePass123!',
        })
        refresh = login.data['refresh']
        # Logout (blacklist the token)
        res = client.post('/api/auth/logout/', {'refresh': refresh})
        self.assertEqual(res.status_code, 200)
        # Try to use the blacklisted refresh token
        res2 = client.post('/api/auth/token/refresh/', {'refresh': refresh})
        self.assertIn(res2.status_code, [400, 401])

    def test_login_creates_audit_log(self):
        initial = SystemLog.objects.filter(categoria='LOGIN').count()
        client = self.get_anon_client()
        client.post('/api/auth/login/', {
            'username': 'admin_test',
            'password': 'SecurePass123!',
        })
        self.assertGreater(SystemLog.objects.filter(categoria='LOGIN').count(), initial)


class AuthorizationTests(BaseAPITestCase):
    """Tests for role-based access control."""

    def test_unauthenticated_access_denied(self):
        client = self.get_anon_client()
        res = client.get('/api/transacciones/')
        self.assertEqual(res.status_code, 401)

    def test_paramedico_cannot_create_user(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/auth/usuarios/', {
            'username': 'hacker',
            'password': 'HackPass123!',
            'rol': 'ADMIN',
        })
        self.assertEqual(res.status_code, 403)

    def test_admin_can_create_user(self):
        client = self.get_client(self.admin)
        res = client.post('/api/auth/usuarios/', {
            'username': 'newuser',
            'password': 'SecurePass123!',
            'first_name': 'New',
            'last_name': 'User',
            'email': 'new@test.com',
            'rol': 'PARAMEDICO',
            'numero_licencia': 'PMD-NEW',
            'fecha_vencimiento_licencia': '2027-01-01',
        })
        self.assertIn(res.status_code, [200, 201])

    def test_paramedico_cannot_create_medicamento(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/medicamentos/medicamentos/', {
            'nombre': 'Hacked Med',
            'principio_activo': 'x',
            'concentracion': 'x',
            'presentacion': 'x',
            'tipo': 'GENERAL',
        })
        self.assertEqual(res.status_code, 403)

    def test_paramedico_sees_only_own_transactions(self):
        # Create a transaction as paramedico
        client_para = self.get_client(self.paramedico)
        client_para.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_PERM',
            'paciente_id': 'PAT-PERM',
        })
        res = client_para.get('/api/transacciones/')
        self.assertEqual(res.status_code, 200)
        # All results should belong to this paramedico
        for tx in res.data.get('results', res.data):
            if isinstance(tx, dict):
                self.assertIn(
                    self.paramedico.id,
                    [tx.get('usuario'), tx.get('testigo')]
                )

    def test_admin_sees_all_transactions(self):
        client = self.get_client(self.admin)
        res = client.get('/api/transacciones/')
        self.assertEqual(res.status_code, 200)

    def test_chain_verification_only_admin_auditor(self):
        client_para = self.get_client(self.paramedico)
        res = client_para.get('/api/reportes/verificar-cadena/')
        self.assertEqual(res.status_code, 403)

        client_admin = self.get_client(self.admin)
        res = client_admin.get('/api/reportes/verificar-cadena/')
        self.assertEqual(res.status_code, 200)

    def test_usuario_field_forced_to_authenticated_user(self):
        """Verify that sending a different usuario_id is overridden."""
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_SPOOF',
            'paciente_id': 'PAT-SPOOF',
            'usuario': self.admin.id,  # Try to spoof
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['usuario'], self.paramedico.id)
