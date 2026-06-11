"""
Señales Django para generación automática de alertas
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import timedelta
from .models import Inventario, Alerta, Usuario, SystemLog


@receiver(post_save, sender=Inventario)
def verificar_caducidades(sender, instance, created, **kwargs):
    """Genera alertas automáticas cuando un medicamento está próximo a vencer"""
    if not instance.fecha_caducidad:
        return

    dias_restantes = (instance.fecha_caducidad - timezone.now().date()).days

    if dias_restantes <= 0:
        Alerta.objects.get_or_create(
            tipo='VENCIDO',
            severidad='CRITICA',
            titulo=f'Medicamento Vencido: {instance.medicamento.nombre}',
            descripcion=f'El medicamento {instance.medicamento.nombre} (Lote: {instance.lote}) '
                       f'en la caja {instance.caja.codigo} ha vencido el {instance.fecha_caducidad}.',
            medicamento_relacionado=instance.medicamento,
            caja_relacionada=instance.caja,
            defaults={'resuelta': False}
        )
    elif dias_restantes <= 30:
        Alerta.objects.get_or_create(
            tipo='VENCIMIENTO',
            severidad='ALTA',
            titulo=f'Próximo a Vencer (30 días): {instance.medicamento.nombre}',
            descripcion=f'El medicamento {instance.medicamento.nombre} (Lote: {instance.lote}) '
                       f'vence en {dias_restantes} días.',
            medicamento_relacionado=instance.medicamento,
            caja_relacionada=instance.caja,
            defaults={'resuelta': False}
        )
    elif dias_restantes <= 60:
        Alerta.objects.get_or_create(
            tipo='VENCIMIENTO',
            severidad='MEDIA',
            titulo=f'Próximo a Vencer (60 días): {instance.medicamento.nombre}',
            descripcion=f'El medicamento {instance.medicamento.nombre} (Lote: {instance.lote}) '
                       f'vence en {dias_restantes} días.',
            medicamento_relacionado=instance.medicamento,
            caja_relacionada=instance.caja,
            defaults={'resuelta': False}
        )


@receiver(post_save, sender=Usuario)
def verificar_licencias(sender, instance, **kwargs):
    """Genera alertas cuando una licencia está por vencer"""
    if not instance.fecha_vencimiento_licencia:
        return

    dias_restantes = (instance.fecha_vencimiento_licencia - timezone.now().date()).days

    if dias_restantes <= 30 and dias_restantes >= 0:
        Alerta.objects.get_or_create(
            tipo='LICENCIA',
            severidad='ALTA' if dias_restantes <= 7 else 'MEDIA',
            titulo=f'Licencia por Vencer: {instance.get_full_name()}',
            descripcion=f'La licencia de {instance.get_full_name()} vence en {dias_restantes} días '
                       f'({instance.fecha_vencimiento_licencia}).',
            usuario_relacionado=instance,
            defaults={'resuelta': False}
        )
