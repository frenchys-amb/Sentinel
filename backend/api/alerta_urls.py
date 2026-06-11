"""
URLs de Alertas, Incidentes y Dashboard
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AlertaViewSet, IncidenteViewSet, DashboardViewSet

router = DefaultRouter()
router.register(r'incidentes', IncidenteViewSet, basename='incidente')
router.register(r'dashboard', DashboardViewSet, basename='dashboard')
router.register(r'', AlertaViewSet, basename='alerta')

urlpatterns = [
    path('', include(router.urls)),
]
