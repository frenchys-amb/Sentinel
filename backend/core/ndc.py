"""
Utilidades para el National Drug Code (NDC).

El NDC identifica cada medicamento ante la FDA. En el empaque aparece
como 10 dígitos en tres segmentos (etiquetador-producto-empaque) con
uno de estos formatos: 4-4-2, 5-3-2 o 5-4-1. Para almacenamiento y
reportes se normaliza al formato HIPAA de 11 dígitos (5-4-2) rellenando
con cero el segmento corto.
"""
import re


class NDCInvalido(ValueError):
    """El valor no tiene un formato NDC reconocible."""


_FORMATOS_VALIDOS = {(4, 4, 2), (5, 3, 2), (5, 4, 1), (5, 4, 2)}


def normalizar_ndc(valor):
    """
    Normaliza un NDC a 11 dígitos sin guiones (formato 5-4-2).

    Acepta:
      - 11 dígitos sin guiones (ya normalizado)
      - Con guiones en formato 4-4-2, 5-3-2, 5-4-1 o 5-4-2

    Un NDC de 10 dígitos SIN guiones se rechaza porque es ambiguo:
    no se puede saber qué segmento lleva el cero de relleno.
    """
    if not valor:
        raise NDCInvalido('El NDC no puede estar vacío.')

    valor = valor.strip()

    if re.fullmatch(r'\d{11}', valor):
        return valor

    if re.fullmatch(r'\d{10}', valor):
        raise NDCInvalido(
            'Un NDC de 10 dígitos sin guiones es ambiguo. '
            'Ingréselo con guiones tal como aparece en el empaque '
            '(ej. 0002-1433-80) o en formato de 11 dígitos.'
        )

    match = re.fullmatch(r'(\d{4,5})-(\d{3,4})-(\d{1,2})', valor)
    if not match:
        raise NDCInvalido(
            f'"{valor}" no es un NDC válido. Formatos aceptados: '
            '4-4-2, 5-3-2 o 5-4-1 con guiones, o 11 dígitos.'
        )

    segmentos = match.groups()
    if tuple(len(s) for s in segmentos) not in _FORMATOS_VALIDOS:
        raise NDCInvalido(
            f'"{valor}" no corresponde a un formato NDC válido '
            '(4-4-2, 5-3-2, 5-4-1 o 5-4-2).'
        )

    return segmentos[0].zfill(5) + segmentos[1].zfill(4) + segmentos[2].zfill(2)


def formatear_ndc(ndc):
    """Da formato legible 5-4-2 a un NDC normalizado de 11 dígitos."""
    if not ndc or not re.fullmatch(r'\d{11}', ndc):
        return ndc or ''
    return f'{ndc[:5]}-{ndc[5:9]}-{ndc[9:]}'
