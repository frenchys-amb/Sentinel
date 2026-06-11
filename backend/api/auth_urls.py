"""
URLs de Autenticación — JWT (SimpleJWT)
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from rest_framework_simplejwt.views import TokenObtainPairView
from .views import UsuarioViewSet

usuario_list = UsuarioViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
usuario_detail = UsuarioViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
usuario_me = UsuarioViewSet.as_view({'get': 'me'})
usuario_desbloquear = UsuarioViewSet.as_view({'post': 'desbloquear'})

urlpatterns = [
    # JWT endpoints
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', TokenBlacklistView.as_view(), name='token_blacklist'),

    # User CRUD
    path('usuarios/', usuario_list, name='usuario-list'),
    path('usuarios/me/', usuario_me, name='usuario-me'),
    path('usuarios/<int:pk>/', usuario_detail, name='usuario-detail'),
    path('usuarios/<int:pk>/desbloquear/', usuario_desbloquear, name='usuario-desbloquear'),
]
