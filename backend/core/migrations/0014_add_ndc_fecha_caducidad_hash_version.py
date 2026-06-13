"""
Fase 1 NDC:
- Medicamento.ndc (11 dígitos normalizado) y dea_schedule
- Transaccion.fecha_caducidad (se propaga al inventario)
- Transaccion.hash_version: las filas existentes quedan en v1 para que
  la verificación de cadena recalcule sus hashes con la fórmula original;
  las nuevas transacciones usan v2 (incluye fecha_caducidad en el hash).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_add_turnoconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicamento',
            name='ndc',
            field=models.CharField(
                blank=True, db_index=True, max_length=11, null=True, unique=True,
                help_text='National Drug Code normalizado a 11 dígitos (5-4-2). '
                          'Obligatorio para narcóticos y controlados.'),
        ),
        migrations.AddField(
            model_name='medicamento',
            name='dea_schedule',
            field=models.CharField(
                blank=True, max_length=5,
                choices=[('II', 'Schedule II'), ('III', 'Schedule III'),
                         ('IV', 'Schedule IV'), ('V', 'Schedule V')],
                help_text='Clasificación DEA de sustancia controlada (II-V)'),
        ),
        migrations.AddField(
            model_name='transaccion',
            name='fecha_caducidad',
            field=models.DateField(
                blank=True, null=True,
                help_text='Fecha de expiración del lote — se propaga al inventario al recibir'),
        ),
        # Primero con default=1: las filas existentes se rellenan con 1 (fórmula original)
        migrations.AddField(
            model_name='transaccion',
            name='hash_version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        # Luego el default pasa a 2 para las transacciones nuevas
        migrations.AlterField(
            model_name='transaccion',
            name='hash_version',
            field=models.PositiveSmallIntegerField(default=2),
        ),
    ]
