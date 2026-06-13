"""
Inmutabilidad a nivel de base de datos mediante triggers.

Las RLS de Supabase (rls_policies.sql) las ignora el rol `postgres` con el
que se conecta la aplicación, así que no garantizan inmutabilidad frente a
la propia app ni frente a un administrador de base de datos. Un trigger
BEFORE UPDATE/DELETE sí se aplica a todos los roles (incluido superusuario),
y queda versionado en las migraciones en vez de ejecutarse a mano en la
consola de Supabase.

Solo se instala en PostgreSQL; en SQLite (pruebas locales rápidas) se omite.
Cumplimiento: DEA 21 CFR 1304.04, 21 CFR 1304.21
"""
from django.db import migrations


SQL_CREAR = """
CREATE OR REPLACE FUNCTION bloquear_modificacion_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Registro inmutable: la tabla % no permite % (auditoria DEA 21 CFR 1304)',
        TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transacciones_inmutable ON transacciones;
CREATE TRIGGER trg_transacciones_inmutable
    BEFORE UPDATE OR DELETE ON transacciones
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_system_logs_inmutable ON system_logs;
CREATE TRIGGER trg_system_logs_inmutable
    BEFORE UPDATE OR DELETE ON system_logs
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
"""

SQL_REVERTIR = """
DROP TRIGGER IF EXISTS trg_transacciones_inmutable ON transacciones;
DROP TRIGGER IF EXISTS trg_system_logs_inmutable ON system_logs;
DROP FUNCTION IF EXISTS bloquear_modificacion_inmutable();
"""


def crear_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    # Cursor crudo (sin params) para no interpretar los '%' del RAISE EXCEPTION
    # como placeholders de parámetros.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(SQL_CREAR)


def borrar_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(SQL_REVERTIR)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_add_performance_indexes'),
    ]

    operations = [
        migrations.RunPython(crear_triggers, borrar_triggers),
    ]
