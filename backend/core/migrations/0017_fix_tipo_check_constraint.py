from django.db import migrations


def forwards_sql(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return  # SQLite doesn't support DROP CONSTRAINT IF EXISTS
    schema_editor.execute(
        "ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;"
    )
    schema_editor.execute(
        "ALTER TABLE transacciones ADD CONSTRAINT transacciones_tipo_check "
        "CHECK (tipo IN ('RECEIPT', 'PICKUP', 'TRANSFER', 'RETURN', 'WASTE', 'ADMINISTRATION', 'DAMAGE', 'INVENTORY'));"
    )


def reverse_sql(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(
        "ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;"
    )
    schema_editor.execute(
        "ALTER TABLE transacciones ADD CONSTRAINT transacciones_tipo_check "
        "CHECK (tipo IN ('PICKUP', 'TRANSFER', 'RETURN', 'WASTE', 'ADMINISTRATION', 'DAMAGE', 'INVENTORY'));"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_add_protocolo_acuse'),
    ]

    operations = [
        migrations.RunPython(forwards_sql, reverse_sql),
    ]
