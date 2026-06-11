# Generated initial migration

from django.conf import settings
import django.contrib.auth.models
import django.contrib.auth.validators
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import django.core.validators


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Usuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('email', models.EmailField(blank=True, max_length=254, verbose_name='email address')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('rol', models.CharField(choices=[('PARAMEDICO', 'Paramédico'), ('ADMIN', 'Administrador'), ('AUDITOR', 'Auditor')], default='PARAMEDICO', max_length=20)),
                ('numero_licencia', models.CharField(blank=True, max_length=50, null=True, unique=True)),
                ('fecha_vencimiento_licencia', models.DateField(blank=True, null=True)),
                ('firma_digital', models.TextField(blank=True, help_text='Hash de firma digital', null=True)),
                ('telefono', models.CharField(blank=True, max_length=20)),
                ('unidad_asignada', models.CharField(blank=True, max_length=100)),
                ('activo', models.BooleanField(default=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'db_table': 'usuarios',
            },
            managers=[
                ('objects', django.contrib.auth.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Medicamento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=200)),
                ('principio_activo', models.CharField(max_length=200)),
                ('concentracion', models.CharField(max_length=50)),
                ('presentacion', models.CharField(max_length=100)),
                ('tipo', models.CharField(choices=[('GENERAL', 'General'), ('CONTROLADO', 'Controlado'), ('NARCOTICO', 'Narcótico')], default='GENERAL', max_length=20)),
                ('codigo_barras', models.CharField(blank=True, max_length=100, null=True, unique=True)),
                ('requiere_doble_factor', models.BooleanField(default=False, help_text='Narcóticos siempre requieren doble factor')),
                ('temperatura_conservacion', models.CharField(blank=True, max_length=50)),
                ('activo', models.BooleanField(default=True)),
            ],
            options={
                'db_table': 'medicamentos',
            },
        ),
        migrations.CreateModel(
            name='Caja',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.CharField(max_length=50, unique=True)),
                ('nombre', models.CharField(max_length=100)),
                ('ubicacion', models.CharField(max_length=100)),
                ('unidad', models.CharField(max_length=100)),
                ('estado', models.CharField(choices=[('ACTIVA', 'Activa'), ('EN_TRANSITO', 'En Tránsito'), ('CERRADA', 'Cerrada'), ('EXTRAVIADA', 'Extraviada')], default='ACTIVA', max_length=20)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('responsable', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='cajas_responsable', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'cajas',
            },
        ),
        migrations.CreateModel(
            name='Inventario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cantidad', models.PositiveIntegerField(default=0, validators=[django.core.validators.MinValueValidator(0)])),
                ('lote', models.CharField(blank=True, max_length=50)),
                ('fecha_caducidad', models.DateField(blank=True, null=True)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('caja', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='inventarios', to='core.caja')),
                ('medicamento', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='inventarios', to='core.medicamento')),
            ],
            options={
                'db_table': 'inventarios',
                'unique_together': {('caja', 'medicamento', 'lote')},
            },
        ),
        migrations.CreateModel(
            name='SystemLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('categoria', models.CharField(choices=[('LOGIN', 'Inicio de Sesión'), ('LOGIN_FAIL', 'Intento Fallido'), ('TRANSACCION', 'Transacción'), ('ALERTA', 'Alerta de Seguridad'), ('INTENTO_ALTERACION', 'Intento de Alteración'), ('CONFIG', 'Cambio de Configuración'), ('SYNC', 'Sincronización Offline')], max_length=20)),
                ('descripcion', models.TextField()),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'system_logs',
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='Transaccion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hash_transaccion', models.CharField(db_index=True, max_length=64, unique=True)),
                ('tipo', models.CharField(choices=[('PICKUP', 'Recolección'), ('TRANSFER', 'Transferencia'), ('RETURN', 'Devolución'), ('WASTE', 'Descarte'), ('ADMINISTRATION', 'Administración'), ('DAMAGE', 'Daño/Incidencia'), ('INVENTORY', 'Ajuste de Inventario')], max_length=20)),
                ('cantidad', models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(1)])),
                ('lote', models.CharField(blank=True, max_length=50)),
                ('paciente_id', models.CharField(blank=True, help_text='ID anónimo del paciente', max_length=100)),
                ('motivo', models.TextField(blank=True)),
                ('ubicacion', models.CharField(blank=True, max_length=200)),
                ('evidencia_urls', models.JSONField(blank=True, default=list, help_text='Array de URLs de evidencia fotográfica')),
                ('firma_usuario', models.CharField(blank=True, max_length=64)),
                ('firma_testigo', models.CharField(blank=True, max_length=64)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('offline_id', models.CharField(blank=True, db_index=True, help_text='ID generado en dispositivo offline', max_length=100)),
                ('sincronizado', models.BooleanField(default=True)),
                ('fecha_sincronizacion', models.DateTimeField(blank=True, null=True)),
                ('caja_destino', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='transacciones_entrada', to='core.caja')),
                ('caja_origen', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='transacciones_salida', to='core.caja')),
                ('medicamento', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='transacciones', to='core.medicamento')),
                ('testigo', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='transacciones_testigo', to=settings.AUTH_USER_MODEL)),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='transacciones_realizadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'transacciones',
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='Alerta',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[('DESVIO', 'Posible Desvío'), ('VENCIMIENTO', 'Próximo a Vencer'), ('VENCIDO', 'Medicamento Vencido'), ('CAJA_EXTRAVIADA', 'Caja Extraviada'), ('LICENCIA', 'Licencia por Vencer'), ('INVENTARIO_BAJO', 'Inventario Bajo'), ('DISCREPANCIA', 'Discrepancia Detectada')], max_length=20)),
                ('severidad', models.CharField(choices=[('BAJA', 'Baja'), ('MEDIA', 'Media'), ('ALTA', 'Alta'), ('CRITICA', 'Crítica')], max_length=10)),
                ('titulo', models.CharField(max_length=200)),
                ('descripcion', models.TextField()),
                ('resuelta', models.BooleanField(default=False)),
                ('fecha_resolucion', models.DateTimeField(blank=True, null=True)),
                ('notas_resolucion', models.TextField(blank=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('caja_relacionada', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='alertas', to='core.caja')),
                ('medicamento_relacionado', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='alertas', to='core.medicamento')),
                ('resuelta_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='alertas_resueltas', to=settings.AUTH_USER_MODEL)),
                ('transaccion_relacionada', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='alertas', to='core.transaccion')),
                ('usuario_relacionado', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='alertas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'alertas',
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='Turno',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha_inicio', models.DateTimeField(auto_now_add=True)),
                ('fecha_fin', models.DateTimeField(blank=True, null=True)),
                ('activo', models.BooleanField(default=True)),
                ('contador_waste', models.PositiveIntegerField(default=0)),
                ('contador_administration', models.PositiveIntegerField(default=0)),
                ('caja', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='turnos', to='core.caja')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='turnos', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'turnos',
            },
        ),
    ]
