from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_add_protocolo_acuse'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
                ALTER TABLE transacciones ADD CONSTRAINT transacciones_tipo_check
                    CHECK (tipo IN ('RECEIPT', 'PICKUP', 'TRANSFER', 'RETURN', 'WASTE', 'ADMINISTRATION', 'DAMAGE', 'INVENTORY'));
            """,
            reverse_sql="""
                ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
                ALTER TABLE transacciones ADD CONSTRAINT transacciones_tipo_check
                    CHECK (tipo IN ('PICKUP', 'TRANSFER', 'RETURN', 'WASTE', 'ADMINISTRATION', 'DAMAGE', 'INVENTORY'));
            """
        ),
    ]
