"""
Base test utilities for XentraSentinel test suite.
Provides factory methods and common setup for all test modules.
"""
from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.models import Usuario, Caja, Medicamento, Inventario, Unidad


class BaseAPITestCase(TestCase):
    """Base class with factory methods for all API tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data — runs once per TestCase class."""
        cls.unidad = Unidad.objects.create(nombre='Ambulancia Delta-1', activa=True)

        cls.admin = Usuario.objects.create_user(
            username='admin_test', password='SecurePass123!',
            first_name='Admin', last_name='Test',
            rol='ADMIN', activo=True,
            numero_licencia='ADM-001',
            fecha_vencimiento_licencia=date.today() + timedelta(days=365),
        )
        cls.paramedico = Usuario.objects.create_user(
            username='para_test', password='SecurePass123!',
            first_name='Para', last_name='Medico',
            rol='PARAMEDICO', activo=True,
            numero_licencia='PMD-001',
            fecha_vencimiento_licencia=date.today() + timedelta(days=180),
            unidad_asignada='Ambulancia Delta-1',
        )
        cls.testigo = Usuario.objects.create_user(
            username='testigo_test', password='SecurePass123!',
            first_name='Testigo', last_name='Uno',
            rol='PARAMEDICO', activo=True,
            numero_licencia='PMD-002',
            fecha_vencimiento_licencia=date.today() + timedelta(days=180),
        )
        cls.auditor = Usuario.objects.create_user(
            username='auditor_test', password='SecurePass123!',
            first_name='Auditor', last_name='Test',
            rol='AUDITOR', activo=True,
            numero_licencia='AUD-001',
            fecha_vencimiento_licencia=date.today() + timedelta(days=365),
        )
        cls.expired_user = Usuario.objects.create_user(
            username='expired_test', password='SecurePass123!',
            first_name='Expired', last_name='User',
            rol='PARAMEDICO', activo=True,
            numero_licencia='PMD-999',
            fecha_vencimiento_licencia=date.today() - timedelta(days=10),
        )

        cls.caja = Caja.objects.create(
            codigo='CAJA-TEST-01', nombre='Narcoticos Test',
            ubicacion='Compartimiento A', unidad='Ambulancia Delta-1',
            estado='ACTIVA', responsable=cls.paramedico,
        )
        cls.caja2 = Caja.objects.create(
            codigo='CAJA-TEST-02', nombre='Generales Test',
            ubicacion='Compartimiento B', unidad='Ambulancia Delta-1',
            estado='ACTIVA', responsable=cls.admin,
        )

        cls.narcotico = Medicamento.objects.create(
            nombre='Fentanyl', principio_activo='Fentanilo',
            concentracion='50 mcg/mL', presentacion='Ampolla 2mL',
            tipo='NARCOTICO', requiere_doble_factor=True, activo=True,
        )
        cls.controlado = Medicamento.objects.create(
            nombre='Midazolam', principio_activo='Midazolam',
            concentracion='5 mg/mL', presentacion='Ampolla 3mL',
            tipo='CONTROLADO', activo=True,
        )
        cls.general = Medicamento.objects.create(
            nombre='Paracetamol', principio_activo='Acetaminofen',
            concentracion='500 mg', presentacion='Tableta',
            tipo='GENERAL', activo=True,
        )

        # Pre-stock inventory
        Inventario.objects.create(
            caja=cls.caja, medicamento=cls.narcotico,
            cantidad=10, lote='LOT-N-001',
            fecha_caducidad=date.today() + timedelta(days=180),
        )
        Inventario.objects.create(
            caja=cls.caja, medicamento=cls.controlado,
            cantidad=20, lote='LOT-C-001',
            fecha_caducidad=date.today() + timedelta(days=90),
        )
        Inventario.objects.create(
            caja=cls.caja, medicamento=cls.general,
            cantidad=50, lote='LOT-G-001',
            fecha_caducidad=date.today() + timedelta(days=365),
        )
        Inventario.objects.create(
            caja=cls.caja2, medicamento=cls.general,
            cantidad=30, lote='LOT-G-002',
            fecha_caducidad=date.today() + timedelta(days=365),
        )

    def get_client(self, user):
        """Returns an authenticated APIClient for the given user."""
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        return client

    def get_anon_client(self):
        """Returns an unauthenticated APIClient."""
        return APIClient()
