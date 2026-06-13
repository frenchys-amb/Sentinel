"""
Pruebas de la Fase 2: transacción RECEIPT (Recepción/Compra).

Al recibir narcóticos o controlados el sistema exige NDC (en catálogo),
lote y fecha de expiración, y propaga la fecha al inventario.
"""
from datetime import date, timedelta

from core.models import Inventario, Medicamento

from .test_base import BaseAPITestCase

URL = '/api/transacciones/'


class ReceiptTests(BaseAPITestCase):

    def _payload(self, **extra):
        payload = {
            'tipo': 'RECEIPT',
            'caja_destino': self.caja.id,
            'medicamento': self.narcotico.id,
            'cantidad': 10,
            'lote': 'LOT-RCV-001',
            'fecha_caducidad': (date.today() + timedelta(days=365)).isoformat(),
            'testigo': self.testigo.id,
            'firma_usuario': 'FIRMA_RECEPCION',
        }
        payload.update(extra)
        return payload

    def test_recepcion_narcotico_completa(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload())
        self.assertEqual(res.status_code, 201, res.content)
        inv = Inventario.objects.get(
            caja=self.caja, medicamento=self.narcotico, lote='LOT-RCV-001'
        )
        self.assertEqual(inv.cantidad, 10)
        self.assertEqual(
            inv.fecha_caducidad, date.today() + timedelta(days=365)
        )
        # El NDC del medicamento viaja en la respuesta
        self.assertEqual(res.json()['medicamento_ndc'], '00409909432')

    def test_recepcion_narcotico_sin_lote_rechazada(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(lote=''))
        self.assertEqual(res.status_code, 400)
        self.assertIn('lote', res.json())

    def test_recepcion_narcotico_sin_fecha_rechazada(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(fecha_caducidad=''))
        self.assertEqual(res.status_code, 400)
        self.assertIn('fecha_caducidad', res.json())

    def test_recepcion_narcotico_vencido_rechazada(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(
            fecha_caducidad=(date.today() - timedelta(days=1)).isoformat()
        ))
        self.assertEqual(res.status_code, 400)
        self.assertIn('fecha_caducidad', res.json())

    def test_recepcion_narcotico_sin_testigo_rechazada(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(testigo=''))
        self.assertEqual(res.status_code, 400)
        self.assertIn('testigo', res.json())

    def test_recepcion_sin_caja_destino_rechazada(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(caja_destino=''))
        self.assertEqual(res.status_code, 400)
        self.assertIn('caja_destino', res.json())

    def test_recepcion_controlado_exige_fecha(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(
            medicamento=self.controlado.id, testigo='', fecha_caducidad=''
        ))
        self.assertEqual(res.status_code, 400)
        self.assertIn('fecha_caducidad', res.json())

    def test_recepcion_narcotico_sin_ndc_en_catalogo_rechazada(self):
        sin_ndc = Medicamento.objects.create(
            nombre='Ketamina Legacy', principio_activo='Ketamina',
            concentracion='50 mg/mL', presentacion='Vial 10mL',
            tipo='NARCOTICO', activo=True,
        )
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(medicamento=sin_ndc.id))
        self.assertEqual(res.status_code, 400)
        self.assertIn('medicamento', res.json())
        self.assertIn('NDC', str(res.json()['medicamento']))

    def test_recepcion_general_sin_lote_ni_fecha_permitida(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(
            medicamento=self.general.id, testigo='', lote='', fecha_caducidad=''
        ))
        self.assertEqual(res.status_code, 201, res.content)

    def test_recepcion_acumula_sobre_lote_existente(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, self._payload(lote='LOT-N-001'))
        self.assertEqual(res.status_code, 201, res.content)
        inv = Inventario.objects.get(
            caja=self.caja, medicamento=self.narcotico, lote='LOT-N-001'
        )
        self.assertEqual(inv.cantidad, 20)  # 10 del fixture + 10 recibidos
        # La fecha original del lote no se sobreescribe
        self.assertEqual(inv.fecha_caducidad, date.today() + timedelta(days=180))
