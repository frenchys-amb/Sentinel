"""
Inmutabilidad a nivel de base de datos (Fase: CI con PostgreSQL).

Verifica que el trigger de la migración 0021 impide alterar o borrar
transacciones y system_logs con SQL directo — la garantía real de
inmutabilidad, más allá de que la API no exponga endpoints de UPDATE/DELETE.

Solo aplica en PostgreSQL; en SQLite (dev local) el trigger no existe y
estas pruebas se omiten.
"""
from unittest import skipUnless

from django.db import connection, transaction
from django.db.utils import DatabaseError

from core.models import SystemLog, Transaccion

from .test_base import BaseAPITestCase


@skipUnless(connection.vendor == 'postgresql',
            'El trigger de inmutabilidad solo existe en PostgreSQL')
class InmutabilidadDBTests(BaseAPITestCase):

    def _crear_transaccion(self):
        return Transaccion.objects.create(
            usuario=self.paramedico, tipo='ADMINISTRATION',
            caja_origen=self.caja, medicamento=self.general,
            cantidad=1, lote='LOT-G-001', firma_usuario='F-INMUT',
        )

    def test_update_directo_de_transaccion_bloqueado(self):
        tx = self._crear_transaccion()
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute(
                        "UPDATE transacciones SET cantidad = 9999 WHERE id = %s", [tx.id]
                    )
        tx.refresh_from_db()
        self.assertEqual(tx.cantidad, 1)  # intacta

    def test_delete_directo_de_transaccion_bloqueado(self):
        tx = self._crear_transaccion()
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute("DELETE FROM transacciones WHERE id = %s", [tx.id])
        self.assertTrue(Transaccion.objects.filter(pk=tx.id).exists())

    def test_insert_de_transaccion_permitido(self):
        # INSERT sigue funcionando: la inmutabilidad es append-only
        antes = Transaccion.objects.count()
        self._crear_transaccion()
        self.assertEqual(Transaccion.objects.count(), antes + 1)

    def test_update_directo_de_system_log_bloqueado(self):
        log = SystemLog.objects.create(
            categoria='TRANSACCION', usuario=self.paramedico,
            descripcion='log de prueba',
        )
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute(
                        "UPDATE system_logs SET descripcion = 'alterado' WHERE id = %s",
                        [log.id]
                    )
        log.refresh_from_db()
        self.assertEqual(log.descripcion, 'log de prueba')

    def test_delete_directo_de_system_log_bloqueado(self):
        log = SystemLog.objects.create(
            categoria='TRANSACCION', usuario=self.paramedico,
            descripcion='log de prueba',
        )
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute("DELETE FROM system_logs WHERE id = %s", [log.id])
        self.assertTrue(SystemLog.objects.filter(pk=log.id).exists())
