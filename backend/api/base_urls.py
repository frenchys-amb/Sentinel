"""
URLs de Bases
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BaseViewSet

router = DefaultRouter()
router.register(r'', BaseViewSet, basename='base')

urlpatterns = [
    path('', include(router.urls)),
]
