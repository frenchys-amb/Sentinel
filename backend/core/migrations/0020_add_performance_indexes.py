"""
Índices de rendimiento para las tablas más consultadas.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_create_almacen_caja'),
    ]

    operations = [
        # Inventario: queries por caja y fecha_caducidad (dashboard semáforo)
        migrations.AddIndex(
            model_name='inventario',
            index=models.Index(fields=['caja', 'fecha_caducidad'], name='inv_caja_fecha_idx'),
        ),
        # Transaccion: filter by tipo and ordering by timestamp
        migrations.AddIndex(
            model_name='transaccion',
            index=models.Index(fields=['tipo', 'timestamp'], name='tx_tipo_timestamp_idx'),
        ),
        # Transaccion: reports by caja_origen + timestamp
        migrations.AddIndex(
            model_name='transaccion',
            index=models.Index(fields=['caja_origen', 'timestamp'], name='tx_origen_ts_idx'),
        ),
        # Transaccion: reports by caja_destino + timestamp
        migrations.AddIndex(
            model_name='transaccion',
            index=models.Index(fields=['caja_destino', 'timestamp'], name='tx_dest_ts_idx'),
        ),
        # Turno: active shifts per user
        migrations.AddIndex(
            model_name='turno',
            index=models.Index(fields=['usuario', 'activo'], name='turno_user_active_idx'),
        ),
        # Alerta: dashboard queries
        migrations.AddIndex(
            model_name='alerta',
            index=models.Index(fields=['resuelta', 'severidad'], name='alerta_resolved_sev_idx'),
        ),
        # Alerta: timestamp for ordering
        migrations.AddIndex(
            model_name='alerta',
            index=models.Index(fields=['-timestamp'], name='alerta_ts_desc_idx'),
        ),
        # SystemLog: audit queries by usuario + timestamp
        migrations.AddIndex(
            model_name='systemlog',
            index=models.Index(fields=['usuario', '-timestamp'], name='slog_user_ts_idx'),
        ),
        # SystemLog: queries by categoria
        migrations.AddIndex(
            model_name='systemlog',
            index=models.Index(fields=['categoria'], name='slog_categoria_idx'),
        ),
        # Medicamento: filter by tipo and activo
        migrations.AddIndex(
            model_name='medicamento',
            index=models.Index(fields=['tipo', 'activo'], name='med_tipo_activo_idx'),
        ),
    ]
