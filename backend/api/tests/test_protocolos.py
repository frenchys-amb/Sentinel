"""
Pruebas de acuses de lectura de protocolos.
"""
from core.models import ProtocoloAcuse

from .test_base import BaseAPITestCase

URL = '/api/protocolos/acuses/'
SLUG = 'eliminacion-controlados'


class ProtocoloAcuseTests(BaseAPITestCase):

    def test_paramedico_registra_acuse(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, {'protocolo': SLUG, 'version': '1.0'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['protocolo'], SLUG)
        self.assertTrue(
            ProtocoloAcuse.objects.filter(usuario=self.paramedico, protocolo=SLUG).exists()
        )

    def test_acuse_es_idempotente(self):
        client = self.get_client(self.paramedico)
        client.post(URL, {'protocolo': SLUG, 'version': '1.0'})
        res = client.post(URL, {'protocolo': SLUG, 'version': '1.0'})
        self.assertEqual(res.status_code, 200)  # ya existía, no duplica
        self.assertEqual(
            ProtocoloAcuse.objects.filter(usuario=self.paramedico, protocolo=SLUG).count(), 1
        )

    def test_sin_protocolo_rechazado(self):
        client = self.get_client(self.paramedico)
        res = client.post(URL, {})
        self.assertEqual(res.status_code, 400)

    def test_paramedico_solo_ve_sus_acuses(self):
        ProtocoloAcuse.objects.create(usuario=self.paramedico, protocolo=SLUG)
        ProtocoloAcuse.objects.create(usuario=self.testigo, protocolo=SLUG)
        client = self.get_client(self.paramedico)
        res = client.get(URL, {'protocolo': SLUG})
        data = res.json()
        resultados = data.get('results', data)
        self.assertEqual(len(resultados), 1)
        self.assertEqual(resultados[0]['usuario'], self.paramedico.id)

    def test_admin_ve_todos_los_acuses(self):
        ProtocoloAcuse.objects.create(usuario=self.paramedico, protocolo=SLUG)
        ProtocoloAcuse.objects.create(usuario=self.testigo, protocolo=SLUG)
        client = self.get_client(self.admin)
        res = client.get(URL, {'protocolo': SLUG})
        data = res.json()
        resultados = data.get('results', data)
        self.assertEqual(len(resultados), 2)

    def test_nueva_version_genera_nuevo_acuse(self):
        client = self.get_client(self.paramedico)
        client.post(URL, {'protocolo': SLUG, 'version': '1.0'})
        res = client.post(URL, {'protocolo': SLUG, 'version': '2.0'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            ProtocoloAcuse.objects.filter(usuario=self.paramedico, protocolo=SLUG).count(), 2
        )

    def test_requiere_autenticacion(self):
        res = self.get_anon_client().post(URL, {'protocolo': SLUG})
        self.assertEqual(res.status_code, 401)
