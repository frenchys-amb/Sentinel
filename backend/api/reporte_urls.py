"""
URLs de Reportes
"""
from django.urls import path
from .views import ReporteViewSet

reporte_dea = ReporteViewSet.as_view({'get': 'dea_pdf'})
reporte_csv = ReporteViewSet.as_view({'get': 'csv_transacciones'})
reporte_actividad = ReporteViewSet.as_view({'get': 'actividad'})
reporte_audit = ReporteViewSet.as_view({'get': 'audit_log'})
reporte_caducidades = ReporteViewSet.as_view({'get': 'caducidades'})
reporte_verificar_cadena = ReporteViewSet.as_view({'get': 'verificar_cadena'})

urlpatterns = [
    path('dea/', reporte_dea, name='reporte-dea'),
    path('csv/', reporte_csv, name='reporte-csv'),
    path('actividad/', reporte_actividad, name='reporte-actividad'),
    path('audit-log/', reporte_audit, name='reporte-audit-log'),
    path('caducidades/', reporte_caducidades, name='reporte-caducidades'),
    path('verificar-cadena/', reporte_verificar_cadena, name='reporte-verificar-cadena'),
]
