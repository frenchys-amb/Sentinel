"""
Tests for Turno (shift) management: open, close, snapshots, discrepancies.
"""
from core.models import Turno, Alerta
from .test_base import BaseAPITestCase


class TurnoLifecycleTests(BaseAPITestCase):
    """Tests for shift open/close lifecycle."""

    def test_open_turno(self):
        client = self.get_client(self.paramedico)
        res = client.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_INICIO',
        })
        self.assertEqual(res.status_code, 201, res.data)
        turno = Turno.objects.get(id=res.data['id'])
        self.assertTrue(turno.activo)
        self.assertEqual(turno.usuario, self.paramedico)
        # Snapshot should be populated
        self.assertGreater(len(turno.snapshot_inicial), 0)

    def test_close_turno(self):
        client = self.get_client(self.paramedico)
        # Open
        client.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_INICIO',
        })
        # Close
        res = client.post('/api/transacciones/turnos/cerrar_actual/', {
            'firma_cierre': 'FIRMA_CIERRE',
            'conteo_final_confirmado': True,
            'notas_cierre': 'Todo en orden',
        })
        self.assertEqual(res.status_code, 200, res.data)
        turno = Turno.objects.filter(usuario=self.paramedico).order_by('-id').first()
        self.assertFalse(turno.activo)
        self.assertIsNotNone(turno.fecha_fin)

    def test_close_requires_signature(self):
        client = self.get_client(self.paramedico)
        client.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_INICIO',
        })
        res = client.post('/api/transacciones/turnos/cerrar_actual/', {
            'conteo_final_confirmado': True,
            # Missing firma_cierre
        })
        self.assertEqual(res.status_code, 400)

    def test_discrepancy_creates_alert(self):
        client = self.get_client(self.paramedico)
        client.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_DISC',
        })
        turno = Turno.objects.filter(usuario=self.paramedico, activo=True).first()
        snapshot = turno.snapshot_inicial

        # Close with discrepant physical count
        altered_count = []
        for item in snapshot:
            altered_count.append({
                'inventario_id': item['inventario_id'],
                'cantidad_fisica': item['cantidad'] - 1,  # Off by 1
            })

        initial_alerts = Alerta.objects.filter(tipo='DISCREPANCIA').count()
        client.post('/api/transacciones/turnos/cerrar_actual/', {
            'firma_cierre': 'FIRMA_DISC_CLOSE',
            'conteo_final_confirmado': True,
            'conteo_fisico_final': altered_count,
        }, format='json')
        self.assertGreater(
            Alerta.objects.filter(tipo='DISCREPANCIA').count(),
            initial_alerts
        )

    def test_cannot_open_caja_already_in_use(self):
        client1 = self.get_client(self.paramedico)
        client1.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_1',
        })
        # Another user tries to open the same box
        client2 = self.get_client(self.testigo)
        res = client2.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_2',
        })
        self.assertEqual(res.status_code, 400)

    def test_get_turno_actual(self):
        client = self.get_client(self.paramedico)
        client.post('/api/transacciones/turnos/', {
            'caja': self.caja.id,
            'conteo_inicial_confirmado': True,
            'firma_inicio': 'FIRMA_ACT',
        })
        res = client.get('/api/transacciones/turnos/actual/')
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data['turno'])
