"""
Cliente del FDA NDC Directory vía openFDA.

El directorio nacional de NDC lo mantiene la FDA (no la DEA) y es de
acceso público: https://api.fda.gov/drug/ndc.json. Se consulta para
verificar que un NDC exista y para autocompletar el catálogo
(nombre, fabricante, presentación, concentración y schedule DEA).

Los resultados se cachean 30 días: el NDC de un producto no cambia y
las unidades operan con conectividad intermitente.
"""
import logging

import requests
from django.core.cache import cache

from .ndc import formatear_ndc

logger = logging.getLogger(__name__)

OPENFDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json'
TIMEOUT_SEGUNDOS = 8
CACHE_TTL = 60 * 60 * 24 * 30  # 30 días

# openFDA reporta el schedule como "CII".."CV"
_SCHEDULE_MAP = {'CII': 'II', 'CIII': 'III', 'CIV': 'IV', 'CV': 'V'}

# Marcador cacheable para "consultado y no existe" (distinto de "sin caché")
_NO_ENCONTRADO = '__NDC_NO_ENCONTRADO__'


class FDAServicioNoDisponible(Exception):
    """No se pudo contactar openFDA (sin red, timeout o error del servicio)."""


def _candidatos_product_ndc(ndc11):
    """
    El directorio FDA almacena el product NDC en su formato original de
    10 dígitos (4-4 o 5-3 o 5-4). Desde el NDC normalizado de 11 dígitos
    no se sabe qué segmento llevaba el cero de relleno, así que se
    generan los candidatos posibles y se buscan todos.
    """
    labeler, producto = ndc11[:5], ndc11[5:9]
    candidatos = [f'{labeler}-{producto}']
    if labeler.startswith('0'):
        candidatos.append(f'{labeler[1:]}-{producto}')
    if producto.startswith('0'):
        candidatos.append(f'{labeler}-{producto[1:]}')
    return candidatos


def _parsear_resultado(ndc11, r):
    ingredientes = r.get('active_ingredients', []) or []
    concentracion = ', '.join(
        i.get('strength', '') for i in ingredientes if i.get('strength')
    )
    schedule = _SCHEDULE_MAP.get(r.get('dea_schedule', ''), '')
    if schedule == 'II':
        tipo_sugerido = 'NARCOTICO'
    elif schedule:
        tipo_sugerido = 'CONTROLADO'
    else:
        tipo_sugerido = 'GENERAL'

    empaques = [
        p.get('description', '') for p in (r.get('packaging') or [])
        if p.get('description')
    ]

    return {
        'encontrado': True,
        'verificado': True,
        'fuente': 'openFDA (FDA NDC Directory)',
        'ndc': ndc11,
        'ndc_formateado': formatear_ndc(ndc11),
        'nombre': r.get('brand_name', '') or r.get('generic_name', ''),
        'principio_activo': r.get('generic_name', ''),
        'fabricante': r.get('labeler_name', ''),
        'presentacion': r.get('dosage_form', ''),
        'via_administracion': ', '.join(r.get('route', []) or []),
        'concentracion': concentracion,
        'dea_schedule': schedule,
        'tipo_sugerido': tipo_sugerido,
        'empaques': empaques,
    }


def consultar_ndc(ndc11):
    """
    Busca un NDC (normalizado a 11 dígitos) en el directorio de la FDA.

    Retorna dict con la información del producto, o None si el NDC no
    existe en el directorio. Lanza FDAServicioNoDisponible si no hay
    forma de contactar el servicio.
    """
    clave = f'fda_ndc:{ndc11}'
    cacheado = cache.get(clave)
    if cacheado == _NO_ENCONTRADO:
        return None
    if cacheado is not None:
        return cacheado

    candidatos = _candidatos_product_ndc(ndc11)
    search = ' OR '.join(f'product_ndc:"{c}"' for c in candidatos)

    try:
        respuesta = requests.get(
            OPENFDA_NDC_URL,
            params={'search': search, 'limit': 1},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as e:
        logger.warning('openFDA inaccesible para NDC %s: %s', ndc11, e)
        raise FDAServicioNoDisponible(str(e))

    # openFDA responde 404 cuando la búsqueda no tiene resultados
    if respuesta.status_code == 404:
        cache.set(clave, _NO_ENCONTRADO, CACHE_TTL)
        return None

    if respuesta.status_code != 200:
        logger.warning('openFDA respondió %s para NDC %s',
                       respuesta.status_code, ndc11)
        raise FDAServicioNoDisponible(f'HTTP {respuesta.status_code}')

    resultados = respuesta.json().get('results') or []
    if not resultados:
        cache.set(clave, _NO_ENCONTRADO, CACHE_TTL)
        return None

    info = _parsear_resultado(ndc11, resultados[0])
    cache.set(clave, info, CACHE_TTL)
    return info
