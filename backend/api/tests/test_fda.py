"""
Pruebas de la Fase 3: verificación de NDC contra el FDA NDC Directory.

openFDA se simula con mocks — las pruebas no dependen de internet.
"""
from unittest.mock import MagicMock, patch

from django.core.cache import cache
import requests

from core.fda import _candidatos_product_ndc

from .test_base import BaseAPITestCase

URL = '/api/medicamentos/medicamentos/ndc-lookup/'

RESPUESTA_FDA = {
    'results': [{
        'brand_name': 'Fentanyl Citrate',
        'generic_name': 'FENTANYL CITRATE',
        'labeler_name': 'Hospira, Inc.',
        'dosage_form': 'INJECTION, SOLUTION',
        'route': ['INTRAMUSCULAR', 'INTRAVENOUS'],
        'dea_schedule': 'CII',
        'active_ingredients': [
            {'name': 'FENTANYL CITRATE', 'strength': '50 ug/mL'},
        ],
        'packaging': [
            {'description': '25 VIAL in 1 TRAY (0409-9094-22)'},
        ],
    }]
}


def _mock_respuesta(status_code=200, payload=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = payload or {}
    return mock


class CandidatosProductNDCTests(BaseAPITestCase):
    """Reconstrucción de los formatos originales de 10 dígitos."""

    def test_labeler_con_cero_genera_formato_4_4(self):
        self.assertIn('0409-9094', _candidatos_product_ndc('00409909401'))

    def test_producto_con_cero_genera_formato_5_3(self):
        self.assertIn('50242-040', _candidatos_product_ndc('50242004062'))

    def test_siempre_incluye_formato_5_4(self):
        self.assertIn('50242-0040', _candidatos_product_ndc('50242004062'))


class NDCLookupEndpointTests(BaseAPITestCase):

    def setUp(self):
        super().setUp()
        cache.clear()  # la caché de openFDA persiste entre tests

    @patch('core.fda.requests.get')
    def test_ndc_encontrado_autocompleta(self, mock_get):
        mock_get.return_value = _mock_respuesta(200, RESPUESTA_FDA)
        client = self.get_client(self.admin)
        res = client.get(URL, {'ndc': '0409-9094-01'})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['encontrado'])
        self.assertEqual(data['nombre'], 'Fentanyl Citrate')
        self.assertEqual(data['fabricante'], 'Hospira, Inc.')
        self.assertEqual(data['concentracion'], '50 ug/mL')
        self.assertEqual(data['dea_schedule'], 'II')
        self.assertEqual(data['tipo_sugerido'], 'NARCOTICO')
        self.assertEqual(data['ndc'], '00409909401')

    @patch('core.fda.requests.get')
    def test_ndc_no_encontrado(self, mock_get):
        mock_get.return_value = _mock_respuesta(404)
        client = self.get_client(self.admin)
        res = client.get(URL, {'ndc': '99999-9999-99'})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data['encontrado'])
        self.assertTrue(data['verificado'])

    @patch('core.fda.requests.get')
    def test_fda_inaccesible_responde_503(self, mock_get):
        mock_get.side_effect = requests.ConnectionError('sin red')
        client = self.get_client(self.admin)
        res = client.get(URL, {'ndc': '0409-9094-01'})
        self.assertEqual(res.status_code, 503)
        data = res.json()
        self.assertFalse(data['verificado'])
        # El NDC con formato válido sigue siendo utilizable
        self.assertEqual(data['ndc'], '00409909401')

    def test_ndc_invalido_responde_400(self):
        client = self.get_client(self.admin)
        res = client.get(URL, {'ndc': 'no-es-ndc'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('ndc', res.json())

    @patch('core.fda.requests.get')
    def test_resultado_se_cachea(self, mock_get):
        mock_get.return_value = _mock_respuesta(200, RESPUESTA_FDA)
        client = self.get_client(self.admin)
        client.get(URL, {'ndc': '0409-9094-01'})
        client.get(URL, {'ndc': '0409-9094-01'})
        self.assertEqual(mock_get.call_count, 1)

    @patch('core.fda.requests.get')
    def test_no_encontrado_tambien_se_cachea(self, mock_get):
        mock_get.return_value = _mock_respuesta(404)
        client = self.get_client(self.admin)
        client.get(URL, {'ndc': '99999-9999-99'})
        client.get(URL, {'ndc': '99999-9999-99'})
        self.assertEqual(mock_get.call_count, 1)

    @patch('core.fda.requests.get')
    def test_paramedico_puede_consultar(self, mock_get):
        mock_get.return_value = _mock_respuesta(200, RESPUESTA_FDA)
        client = self.get_client(self.paramedico)
        res = client.get(URL, {'ndc': '0409-9094-01'})
        self.assertEqual(res.status_code, 200)
