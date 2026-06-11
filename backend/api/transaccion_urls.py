"""
URLs de Transacciones
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TransaccionViewSet, TurnoViewSet

router = DefaultRouter()
router.register(r'turnos', TurnoViewSet, basename='turno')
router.register(r'', TransaccionViewSet, basename='transaccion')

urlpatterns = [
    path('', include(router.urls)),
]
