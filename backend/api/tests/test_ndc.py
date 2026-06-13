"""
Pruebas de la Fase 1 NDC:
- Normalización y validación del National Drug Code
- NDC obligatorio para narcóticos y controlados en el catálogo
- fecha_caducidad en transacciones se propaga al inventario
- Compatibilidad del hash encadenado (v1 histórico vs v2 nuevo)
"""
import hashlib
import json
from datetime import date, timedelta

from core.models import Inventario, Medicamento, Transaccion
from core.ndc import NDCInvalido, formatear_ndc, normalizar_ndc

from .test_base import BaseAPITestCase


class NormalizacionNDCTests(BaseAPITestCase):
    """Normalización de los 3 formatos de empaque al formato 11 dígitos."""

    def test_formato_4_4_2(self):
        self.assertEqual(normalizar_ndc('0002-1433-80'), '00002143380')

    def test_formato_5_3_2(self):
        self.assertEqual(normalizar_ndc('50242-040-62'), '50242004062')

    def test_formato_5_4_1(self):
        self.assertEqual(normalizar_ndc('60575-4112-1'), '60575411201')

    def test_formato_5_4_2_ya_completo(self):
        self.assertEqual(normalizar_ndc('00409-9094-32'), '00409909432')

    def test_once_digitos_sin_guiones(self):
        self.assertEqual(normalizar_ndc('00409909432'), '00409909432')

    def test_diez_digitos_sin_guiones_es_ambiguo(self):
        with self.assertRaises(NDCInvalido):
            normalizar_ndc('0002143380')

    def test_formato_invalido(self):
        for valor in ['', 'ABC-1234-56', '123-45', '000021-433-80']:
            with self.assertRaises(NDCInvalido):
                normalizar_ndc(valor)

    def test_formatear(self):
        self.assertEqual(formatear_ndc('00409909432'), '00409-9094-32')
        self.assertEqual(formatear_ndc(None), '')


class CatalogoNDCTests(BaseAPITestCase):
    """Validación de NDC al dar de alta medicamentos vía API."""

    URL = '/api/medicamentos/medicamentos/'

    def _payload(self, **extra):
        payload = {
            'nombre': 'Morphine', 'principio_activo': 'Morfina',
            'concentracion': '10 mg/mL', 'presentacion': 'Ampolla 1mL',
            'tipo': 'NARCOTICO',
        }
        payload.update(extra)
        return payload

    def test_narcotico_sin_ndc_rechazado(self):
        client = self.get_client(self.admin)
        res = client.post(self.URL, self._payload())
        self.assertEqual(res.status_code, 400)
        self.assertIn('ndc', res.json())

    def test_controlado_sin_ndc_rechazado(self):
        client = self.get_client(self.admin)
        res = client.post(self.URL, self._payload(tipo='CONTROLADO'))
        self.assertEqual(res.status_code, 400)
        self.assertIn('ndc', res.json())

    def test_general_sin_ndc_permitido(self):
        client = self.get_client(self.admin)
        res = client.post(self.URL, self._payload(nombre='Ibuprofeno', tipo='GENERAL'))
        self.assertEqual(res.status_code, 201)

    def test_narcotico_con_ndc_se_normaliza(self):
        client = self.get_client(self.admin)
        res = client.post(self.URL, self._payload(ndc='0641-6125-25'))
        self.assertEqual(res.status_code, 201)
        med = Medicamento.objects.get(pk=res.json()['id'])
        self.assertEqual(med.ndc, '00641612525')
        self.assertEqual(res.json()['ndc_formateado'], '00641-6125-25')

    def test_ndc_invalido_rechazado(self):
        client = self.get_client(self.admin)
        res = client.post(self.URL, self._payload(ndc='no-es-ndc'))
        self.assertEqual(res.status_code, 400)
        self.assertIn('ndc', res.json())

    def test_ndc_duplicado_rechazado(self):
        client = self.get_client(self.admin)
        # Mismo NDC que el fixture cls.narcotico, en formato de empaque
        res = client.post(self.URL, self._payload(ndc='0409-9094-32'))
        self.assertEqual(res.status_code, 400)
        self.assertIn('ndc', res.json())


class FechaCaducidadTransaccionTests(BaseAPITestCase):
    """La fecha de expiración del PICKUP se propaga al inventario."""

    def test_pickup_escribe_fecha_caducidad_en_inventario(self):
        client = self.get_client(self.paramedico)
        vence = (date.today() + timedelta(days=400)).isoformat()
        res = client.post('/api/transacciones/', {
            'tipo': 'PICKUP',
            'caja_destino': self.caja.id,
            'medicamento': self.general.id,
            'cantidad': 5,
            'lote': 'LOT-NUEVO-01',
            'fecha_caducidad': vence,
            'firma_usuario': 'FIRMA_TEST',
        })
        self.assertEqual(res.status_code, 201, res.content)
        inv = Inventario.objects.get(
            caja=self.caja, medicamento=self.general, lote='LOT-NUEVO-01'
        )
        self.assertEqual(inv.cantidad, 5)
        self.assertEqual(inv.fecha_caducidad.isoformat(), vence)

    def test_pickup_completa_fecha_en_lote_existente_sin_fecha(self):
        Inventario.objects.create(
            caja=self.caja2, medicamento=self.general,
            cantidad=3, lote='LOT-SIN-FECHA',
        )
        client = self.get_client(self.paramedico)
        vence = (date.today() + timedelta(days=200)).isoformat()
        res = client.post('/api/transacciones/', {
            'tipo': 'PICKUP',
            'caja_destino': self.caja2.id,
            'medicamento': self.general.id,
            'cantidad': 2,
            'lote': 'LOT-SIN-FECHA',
            'fecha_caducidad': vence,
            'firma_usuario': 'FIRMA_TEST',
        })
        self.assertEqual(res.status_code, 201, res.content)
        inv = Inventario.objects.get(
            caja=self.caja2, medicamento=self.general, lote='LOT-SIN-FECHA'
        )
        self.assertEqual(inv.cantidad, 5)
        self.assertEqual(inv.fecha_caducidad.isoformat(), vence)


class ReportesNDCTests(BaseAPITestCase):
    """Los reportes de auditoría incluyen el NDC (Fase 5)."""

    def test_csv_incluye_ndc_y_fecha_caducidad(self):
        Transaccion.objects.create(
            usuario=self.paramedico, tipo='RECEIPT',
            caja_destino=self.caja, medicamento=self.narcotico,
            cantidad=5, lote='LOT-CSV-01', testigo=self.testigo,
            fecha_caducidad=date.today() + timedelta(days=300),
            firma_usuario='F-CSV',
        )
        client = self.get_client(self.admin)
        res = client.get('/api/reportes/csv/')
        self.assertEqual(res.status_code, 200)
        contenido = res.content.decode('utf-8-sig')
        encabezado = contenido.splitlines()[0]
        self.assertIn('NDC', encabezado)
        self.assertIn('Fecha Caducidad', encabezado)
        self.assertIn('00409-9094-32', contenido)  # NDC del fixture formateado
        self.assertIn((date.today() + timedelta(days=300)).isoformat(), contenido)

    def test_caducidades_incluye_ndc(self):
        client = self.get_client(self.admin)
        res = client.get('/api/reportes/caducidades/', {'dias': 365})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(len(data) > 0)
        narcotico = next(d for d in data if d['medicamento'] == 'Fentanyl')
        self.assertEqual(narcotico['ndc'], '00409-9094-32')

    def test_dea_pdf_se_genera(self):
        client = self.get_client(self.admin)
        res = client.get('/api/reportes/dea/', {'caja': self.caja.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')


class HashVersionTests(BaseAPITestCase):
    """El hash v2 no debe romper la verificación de transacciones v1."""

    def test_transaccion_v1_conserva_formula_original(self):
        tx = Transaccion.objects.create(
            usuario=self.paramedico, tipo='ADMINISTRATION',
            caja_origen=self.caja, medicamento=self.general,
            cantidad=1, lote='LOT-G-001',
            firma_usuario='F1', hash_version=1,
        )
        # Réplica exacta de la fórmula original (pre-NDC)
        data = {
            'usuario_id': tx.usuario_id,
            'testigo_id': tx.testigo_id,
            'caja_origen_id': tx.caja_origen_id,
            'caja_destino_id': tx.caja_destino_id,
            'tipo': tx.tipo,
            'medicamento_id': tx.medicamento_id,
            'cantidad': tx.cantidad,
            'lote': tx.lote,
            'firma_usuario': tx.firma_usuario,
            'paciente_id': tx.paciente_id,
            'timestamp': tx.timestamp.isoformat(),
            'hash_anterior': tx.hash_anterior,
        }
        hash_original = hashlib.sha256(
            json.dumps(data, sort_keys=True, default=str).encode()
        ).hexdigest()
        self.assertEqual(tx.hash_transaccion, hash_original)

    def test_v2_incluye_fecha_caducidad_en_hash(self):
        tx = Transaccion.objects.create(
            usuario=self.paramedico, tipo='PICKUP',
            caja_destino=self.caja, medicamento=self.general,
            cantidad=1, lote='LOT-HASH',
            fecha_caducidad=date.today() + timedelta(days=100),
            firma_usuario='F2',
        )
        self.assertEqual(tx.hash_version, 2)
        # Alterar la fecha debe invalidar el hash recalculado
        hash_intacto = tx.generar_hash()
        tx.fecha_caducidad = date.today() + timedelta(days=999)
        self.assertNotEqual(tx.generar_hash(), hash_intacto)

    def test_cadena_mixta_v1_v2_verifica(self):
        Transaccion.objects.create(
            usuario=self.paramedico, tipo='ADMINISTRATION',
            caja_origen=self.caja, medicamento=self.general,
            cantidad=1, lote='LOT-G-001', firma_usuario='F1',
            hash_version=1,
        )
        Transaccion.objects.create(
            usuario=self.paramedico, tipo='PICKUP',
            caja_destino=self.caja, medicamento=self.general,
            cantidad=2, lote='LOT-MIX',
            fecha_caducidad=date.today() + timedelta(days=100),
            firma_usuario='F2',
        )
        resultado = Transaccion.verificar_cadena()
        self.assertTrue(resultado['valida'], resultado['errores'])
        self.assertEqual(resultado['verificadas'], 2)
