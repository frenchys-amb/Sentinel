"""
Configuración del Panel de Administración
Solo lectura para registros sensibles (inmutabilidad).
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Usuario, Caja, Medicamento, Inventario, Transaccion, SystemLog, Alerta, Turno, Unidad


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ['username', 'first_name', 'last_name', 'rol', 'numero_licencia', 
                    'fecha_vencimiento_licencia', 'licencia_vigente', 'activo']
    list_filter = ['rol', 'activo', 'fecha_vencimiento_licencia']
    search_fields = ['username', 'first_name', 'last_name', 'numero_licencia']
    fieldsets = UserAdmin.fieldsets + (
        ('Información Profesional', {
            'fields': ('rol', 'numero_licencia', 'fecha_vencimiento_licencia', 
                      'firma_digital', 'telefono', 'unidad_asignada')
        }),
    )


@admin.register(Caja)
class CajaAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'nombre', 'ubicacion', 'unidad', 'estado', 'responsable']
    list_filter = ['estado', 'unidad']
    search_fields = ['codigo', 'nombre']


@admin.register(Medicamento)
class MedicamentoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'principio_activo', 'concentracion', 'tipo', 'requiere_doble_factor', 'activo']
    list_filter = ['tipo', 'activo']
    search_fields = ['nombre', 'principio_activo', 'codigo_barras']


@admin.register(Inventario)
class InventarioAdmin(admin.ModelAdmin):
    list_display = ['caja', 'medicamento', 'cantidad', 'lote', 'fecha_caducidad', 'proximo_a_vencer']
    list_filter = ['caja', 'medicamento__tipo']
    search_fields = ['medicamento__nombre', 'lote']


@admin.register(Transaccion)
class TransaccionAdmin(admin.ModelAdmin):
    """Solo lectura - Inmutabilidad garantizada"""
    list_display = ['id', 'tipo', 'hash_transaccion', 'usuario', 'testigo', 'medicamento', 
                    'cantidad', 'timestamp', 'ip_address']
    list_filter = ['tipo', 'timestamp', 'medicamento__tipo']
    search_fields = ['hash_transaccion', 'usuario__username', 'medicamento__nombre']
    readonly_fields = [f.name for f in Transaccion._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SystemLog)
class SystemLogAdmin(admin.ModelAdmin):
    """Logs de auditoría - Solo lectura"""
    list_display = ['categoria', 'timestamp', 'usuario', 'descripcion', 'ip_address']
    list_filter = ['categoria', 'timestamp']
    search_fields = ['descripcion', 'usuario__username']
    readonly_fields = [f.name for f in SystemLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Alerta)
class AlertaAdmin(admin.ModelAdmin):
    list_display = ['tipo', 'severidad', 'titulo', 'resuelta', 'timestamp']
    list_filter = ['tipo', 'severidad', 'resuelta', 'timestamp']
    search_fields = ['titulo', 'descripcion']
    readonly_fields = ['tipo', 'severidad', 'titulo', 'descripcion', 'timestamp',
                       'usuario_relacionado', 'caja_relacionada', 'medicamento_relacionado',
                       'transaccion_relacionada']


@admin.register(Turno)
class TurnoAdmin(admin.ModelAdmin):
    list_display = ['usuario', 'caja', 'fecha_inicio', 'fecha_fin', 'activo', 
                    'conteo_inicial_confirmado', 'conteo_final_confirmado',
                    'contador_waste', 'contador_administration']
    list_filter = ['activo', 'caja']
    readonly_fields = ['usuario', 'caja', 'fecha_inicio', 'fecha_fin',
                       'conteo_inicial_confirmado', 'conteo_final_confirmado',
                       'firma_inicio', 'firma_cierre', 'notas_cierre',
                       'contador_waste', 'contador_administration']


@admin.register(Unidad)
class UnidadAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'descripcion', 'activa', 'fecha_creacion']
    list_filter = ['activa']
    search_fields = ['nombre']
