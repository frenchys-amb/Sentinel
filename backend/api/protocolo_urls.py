"""
URLs de Protocolos (acuses de lectura)
"""
from rest_framework.routers import DefaultRouter
from .views import ProtocoloAcuseViewSet

router = DefaultRouter()
router.register(r'acuses', ProtocoloAcuseViewSet, basename='protocolo-acuse')

urlpatterns = router.urls
