"""
Crea la caja virtual ALMACÉN para stock comprado que aún no se ha
cargado a cajas de ambulancia.

Flujo:
  RECEIPT → ALMACÉN (compra entra al almacén)
  TRANSFER → ALMACÉN → Caja ambulancia (se carga al vehículo)
"""
from django.db import migrations


def create_almacen(apps, schema_editor):
    Caja = apps.get_model('core', 'Caja')
    Caja.objects.get_or_create(
        codigo='ALMACEN',
        defaults={
            'nombre': 'Almacén / Bodega',
            'ubicacion': 'Bodega central',
            'unidad': 'Almacenamiento',
            'estado': 'ACTIVA',
        },
    )


def remove_almacen(apps, schema_editor):
    Caja = apps.get_model('core', 'Caja')
    Caja.objects.filter(codigo='ALMACEN').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_drop_previous_hash_unique'),
    ]

    operations = [
        migrations.RunPython(create_almacen, remove_almacen),
    ]
