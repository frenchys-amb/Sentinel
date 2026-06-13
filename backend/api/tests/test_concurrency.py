"""
Tests for concurrent access — validates select_for_update and F() expressions.
Uses threading to simulate race conditions.
NOTE: These tests require PostgreSQL (SQLite doesn't support SELECT FOR UPDATE).
"""
import threading
from django.db import connection
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import date, timedelta
from core.models import Usuario, Caja, Medicamento, Inventario, Unidad


@skipUnlessDBFeature('has_select_for_update')
class ConcurrencyTests(TransactionTestCase):
    """
    Uses TransactionTestCase (not TestCase) because threads need real DB transactions.
    Requires PostgreSQL — skipped on SQLite.
    """

    def setUp(self):
        self.unidad = Unidad.objects.create(nombre='Concurrency Unit', activa=True)
        self.user1 = Usuario.objects.create_user(
            username='conc_user1', password='SecurePass123!',
            rol='PARAMEDICO', activo=True,
            numero_licencia='CONC-001',
            fecha_vencimiento_licencia=date.today() + timedelta(days=365),
        )
        self.user2 = Usuario.objects.create_user(
            username='conc_user2', password='SecurePass123!',
            rol='PARAMEDICO', activo=True,
            numero_licencia='CONC-002',
            fecha_vencimiento_licencia=date.today() + timedelta(days=365),
        )
        self.caja = Caja.objects.create(
            codigo='CAJA-CONC', nombre='Concurrency Box',
            ubicacion='Test', unidad='Concurrency Unit',
            estado='ACTIVA', responsable=self.user1,
        )
        self.med = Medicamento.objects.create(
            nombre='ConcMed', principio_activo='Test',
            concentracion='10mg', presentacion='Tab',
            tipo='GENERAL', activo=True,
        )
        Inventario.objects.create(
            caja=self.caja, medicamento=self.med,
            cantidad=10, lote='CONC-LOT',
            fecha_caducidad=date.today() + timedelta(days=180),
        )

    def _get_client(self, user):
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        return client

    def test_concurrent_dispense_preserves_stock(self):
        """
        Two users simultaneously dispense 3 units from a stock of 10.
        Result should be exactly 4 (10 - 3 - 3), not 7 (race condition result).
        """
        results = {'success': 0, 'fail': 0}
        errors = []

        def dispense(user):
            try:
                client = self._get_client(user)
                res = client.post('/api/transacciones/', {
                    'tipo': 'ADMINISTRATION',
                    'caja_origen': self.caja.id,
                    'medicamento': self.med.id,
                    'cantidad': 3,
                    'lote': 'CONC-LOT',
                    'firma_usuario': f'FIRMA_{user.username}',
                    'paciente_id': f'PAT_{user.username}',
                })
                if res.status_code == 201:
                    results['success'] += 1
                else:
                    results['fail'] += 1
            except Exception as e:
                errors.append(str(e))
                results['fail'] += 1
            finally:
                # Cerrar la conexión del hilo para no dejar sesiones abiertas
                # que bloqueen el DROP DATABASE en el teardown.
                connection.close()

        t1 = threading.Thread(target=dispense, args=(self.user1,))
        t2 = threading.Thread(target=dispense, args=(self.user2,))
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        inv = Inventario.objects.get(caja=self.caja, medicamento=self.med, lote='CONC-LOT')

        # Both should succeed — stock was 10, each took 3
        self.assertEqual(results['success'], 2, f'Errors: {errors}')
        self.assertEqual(inv.cantidad, 4)

    def test_concurrent_overdraft_prevented(self):
        """
        Two users try to dispense 7 each from stock of 10.
        Only one should succeed; the other should get stock-insufficient error.
        """
        results = {'success': 0, 'fail': 0}

        def dispense(user):
            try:
                client = self._get_client(user)
                res = client.post('/api/transacciones/', {
                    'tipo': 'ADMINISTRATION',
                    'caja_origen': self.caja.id,
                    'medicamento': self.med.id,
                    'cantidad': 7,
                    'lote': 'CONC-LOT',
                    'firma_usuario': f'FIRMA_{user.username}',
                    'paciente_id': f'PAT_{user.username}',
                })
                if res.status_code == 201:
                    results['success'] += 1
                else:
                    results['fail'] += 1
            finally:
                connection.close()

        t1 = threading.Thread(target=dispense, args=(self.user1,))
        t2 = threading.Thread(target=dispense, args=(self.user2,))
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        inv = Inventario.objects.get(caja=self.caja, medicamento=self.med, lote='CONC-LOT')

        # Exactly one should succeed, one should fail
        self.assertEqual(results['success'], 1)
        self.assertEqual(results['fail'], 1)
        self.assertEqual(inv.cantidad, 3)  # 10 - 7
        self.assertGreaterEqual(inv.cantidad, 0)
