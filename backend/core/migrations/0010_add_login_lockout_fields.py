# Generated manually for login lockout fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_fix_timestamp_explicit'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='intentos_fallidos',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Contador de intentos de login fallidos consecutivos',
            ),
        ),
        migrations.AddField(
            model_name='usuario',
            name='bloqueado_hasta',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Fecha/hora hasta la cual el usuario esta bloqueado temporalmente',
            ),
        ),
        migrations.AddField(
            model_name='usuario',
            name='bloqueado_permanente',
            field=models.BooleanField(
                default=False,
                help_text='Bloqueo permanente que requiere desbloqueo manual por administrador',
            ),
        ),
    ]
