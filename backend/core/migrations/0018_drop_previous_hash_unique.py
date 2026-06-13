"""
La columna 'previous_hash' fue añadida fuera de Django (SQL directo en Supabase)
con UNIQUE y default=repeat('0'::text, 64). Django no la conoce; cada INSERT
hereda el default '0'*64, violando UNIQUE en la segunda fila.

Se elimina la restricción UNIQUE para permitir la cadena de transacciones.
"""
from django.db import migrations


def forwards_sql(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return  # Column doesn't exist on SQLite (added outside Django)
    schema_editor.execute(
        "ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_previous_hash_unique;"
    )


def reverse_sql(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(
        "ALTER TABLE transacciones ADD CONSTRAINT transacciones_previous_hash_unique UNIQUE (previous_hash);"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_fix_tipo_check_constraint'),
    ]

    operations = [
        migrations.RunPython(forwards_sql, reverse_sql),
    ]
