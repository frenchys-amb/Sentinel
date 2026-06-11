"""
URLs de Turnos Config (plantillas de horarios)
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TurnoConfigViewSet

router = DefaultRouter()
router.register(r'', TurnoConfigViewSet, basename='turnoconfig')

urlpatterns = [
    path('', include(router.urls)),
]
