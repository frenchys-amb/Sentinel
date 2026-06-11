"""
URLs de Medicamentos e Inventario
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MedicamentoViewSet, InventarioViewSet, CajaViewSet

router = DefaultRouter()
router.register(r'medicamentos', MedicamentoViewSet, basename='medicamento')
router.register(r'inventario', InventarioViewSet, basename='inventario')
router.register(r'cajas', CajaViewSet, basename='caja')

urlpatterns = [
    path('', include(router.urls)),
]
