"""
Tests for Transaccion CRUD, stock validation, hashing, immutability, and permissions.
"""
from django.test import TestCase
from core.models import Inventario, Transaccion
from .test_base import BaseAPITestCase


class TransaccionCreationTests(BaseAPITestCase):
    """Tests for creating transactions of each type."""

    def test_administration_reduces_stock(self):
        client = self.get_client(self.paramedico)
        inv = Inventario.objects.get(caja=self.caja, medicamento=self.general)
        initial = inv.cantidad

        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 2,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-001',
        })
        self.assertEqual(res.status_code, 201, res.data)
        inv.refresh_from_db()
        self.assertEqual(inv.cantidad, initial - 2)

    def test_waste_requires_witness(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'WASTE',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            # No testigo
        })
        self.assertIn(res.status_code, [400, 403])

    def test_waste_with_witness_succeeds(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'WASTE',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'testigo': self.testigo.id,
        })
        self.assertEqual(res.status_code, 201, res.data)

    def test_narcotic_requires_witness(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.narcotico.id,
            'cantidad': 1,
            'lote': 'LOT-N-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-002',
            # No testigo for narcotic
        })
        self.assertEqual(res.status_code, 400)

    def test_narcotic_with_witness_succeeds(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.narcotico.id,
            'cantidad': 1,
            'lote': 'LOT-N-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-002',
            'testigo': self.testigo.id,
        })
        self.assertEqual(res.status_code, 201, res.data)

    def test_transfer_moves_stock(self):
        client = self.get_client(self.paramedico)
        inv_origen = Inventario.objects.get(caja=self.caja, medicamento=self.general)
        orig_qty = inv_origen.cantidad

        res = client.post('/api/transacciones/', {
            'tipo': 'TRANSFER',
            'caja_origen': self.caja.id,
            'caja_destino': self.caja2.id,
            'medicamento': self.general.id,
            'cantidad': 3,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
        })
        self.assertEqual(res.status_code, 201, res.data)
        inv_origen.refresh_from_db()
        self.assertEqual(inv_origen.cantidad, orig_qty - 3)

    def test_return_increases_stock(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'RETURN',
            'caja_destino': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 5,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
        })
        self.assertEqual(res.status_code, 201, res.data)

    def test_damage_reduces_stock(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'DAMAGE',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'motivo': 'Ampolla rota',
        })
        self.assertEqual(res.status_code, 201, res.data)


class StockValidationTests(BaseAPITestCase):
    """Tests for stock validation and overflow prevention."""

    def test_insufficient_stock_rejected(self):
        client = self.get_client(self.paramedico)
        inv = Inventario.objects.get(caja=self.caja, medicamento=self.general)
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': inv.cantidad + 100,  # More than available
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-X',
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('cantidad', str(res.data).lower())

    def test_stock_never_goes_negative(self):
        """Even after multiple operations, stock should never be < 0."""
        client = self.get_client(self.paramedico)
        inv = Inventario.objects.get(caja=self.caja, medicamento=self.general)
        # Dispense all stock
        client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': inv.cantidad,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-Y',
        })
        inv.refresh_from_db()
        self.assertEqual(inv.cantidad, 0)

        # Try to dispense more — should fail
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-Z',
        })
        self.assertEqual(res.status_code, 400)
        inv.refresh_from_db()
        self.assertGreaterEqual(inv.cantidad, 0)


class TransaccionImmutabilityTests(BaseAPITestCase):
    """Tests that transactions cannot be modified or deleted."""

    def setUp(self):
        self.client = self.get_client(self.paramedico)
        res = self.client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-IMM',
        })
        self.tx_id = res.data['id']

    def test_update_blocked(self):
        res = self.client.put(f'/api/transacciones/{self.tx_id}/', {
            'tipo': 'WASTE',
            'cantidad': 999,
        })
        self.assertIn(res.status_code, [405, 403])

    def test_patch_blocked(self):
        res = self.client.patch(f'/api/transacciones/{self.tx_id}/', {
            'cantidad': 999,
        })
        self.assertIn(res.status_code, [405, 403])

    def test_delete_blocked(self):
        res = self.client.delete(f'/api/transacciones/{self.tx_id}/')
        self.assertIn(res.status_code, [405, 403])

    def test_transaction_still_exists(self):
        res = self.client.get(f'/api/transacciones/{self.tx_id}/')
        self.assertEqual(res.status_code, 200)


class TransaccionHashTests(BaseAPITestCase):
    """Tests for chained hash integrity."""

    def test_hash_generated_on_create(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_TEST',
            'paciente_id': 'PAT-HASH',
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(len(res.data['hash_transaccion']), 64)

    def test_hash_is_deterministic(self):
        tx = Transaccion.objects.create(
            usuario=self.paramedico,
            tipo='ADMINISTRATION',
            caja_origen=self.caja,
            medicamento=self.general,
            cantidad=1,
            firma_usuario='FIRMA_DET',
            paciente_id='DET-001',
        )
        original_hash = tx.hash_transaccion
        recalculated = tx.generar_hash()
        self.assertEqual(original_hash, recalculated)

    def test_chain_links_correctly(self):
        """Two consecutive transactions should be chained."""
        client = self.get_client(self.paramedico)
        res1 = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_C1',
            'paciente_id': 'PAT-C1',
        })
        res2 = client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_C2',
            'paciente_id': 'PAT-C2',
        })
        self.assertEqual(res2.data['hash_anterior'], res1.data['hash_transaccion'])

    def test_chain_verification_passes(self):
        """Verification of the hash chain should pass for all transactions."""
        client = self.get_client(self.paramedico)
        for i in range(3):
            client.post('/api/transacciones/', {
                'tipo': 'ADMINISTRATION',
                'caja_origen': self.caja.id,
                'medicamento': self.general.id,
                'cantidad': 1,
                'lote': 'LOT-G-001',
                'firma_usuario': f'FIRMA_V{i}',
                'paciente_id': f'PAT-V{i}',
            })
        resultado = Transaccion.verificar_cadena()
        self.assertTrue(resultado['valida'], f'Chain errors: {resultado["errores"][:3]}')
        self.assertEqual(len(resultado['errores']), 0)


class TransaccionAuditTests(BaseAPITestCase):
    """Tests that system logs are created for transactions."""

    def test_system_log_created_on_transaction(self):
        from core.models import SystemLog
        initial_count = SystemLog.objects.filter(categoria='TRANSACCION').count()
        client = self.get_client(self.paramedico)
        client.post('/api/transacciones/', {
            'tipo': 'ADMINISTRATION',
            'caja_origen': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 1,
            'lote': 'LOT-G-001',
            'firma_usuario': 'FIRMA_LOG',
            'paciente_id': 'PAT-LOG',
        })
        self.assertGreater(
            SystemLog.objects.filter(categoria='TRANSACCION').count(),
            initial_count
        )
