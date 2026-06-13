"""
URL Configuration - Sistema de Inventario de Medicamentos
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('api.auth_urls')),
    path('api/medicamentos/', include('api.medicamento_urls')),
    path('api/transacciones/', include('api.transaccion_urls')),
    path('api/alertas/', include('api.alerta_urls')),
    path('api/reportes/', include('api.reporte_urls')),
    path('api/unidades/', include('api.unidad_urls')),
    path('api/bases/', include('api.base_urls')),
    path('api/turnos-config/', include('api.turnoconfig_urls')),
    path('api/protocolos/', include('api.protocolo_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
