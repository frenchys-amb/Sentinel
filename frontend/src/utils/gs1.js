/**
 * Parser de codigos GS1 (DataMatrix / Code 128) de empaques farmaceuticos.
 *
 * Por la ley DSCSA, los empaques de medicamentos en EE.UU. llevan un
 * DataMatrix GS1 con Application Identifiers (AI):
 *   (01) GTIN-14  — contiene el NDC de 10 digitos embebido
 *   (17) fecha de expiracion YYMMDD
 *   (10) lote (longitud variable, termina en separador GS)
 *   (21) numero de serie (longitud variable)
 *
 * Un solo escaneo extrae NDC + lote + fecha de expiracion.
 */

const GS = String.fromCharCode(29); // separador FNC1/GS de campos variables

// AIs de longitud fija que nos interesan o que debemos saltar
const FIXED_AIS = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
};
// AIs de longitud variable (terminan en GS o fin de cadena)
const VARIABLE_AIS = ['10', '21', '22', '30', '37', '240', '241'];

/**
 * Convierte AI(17) YYMMDD a fecha ISO. Si el dia es "00" (permitido por
 * GS1), se usa el ultimo dia del mes.
 */
export function parsearFechaGS1(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const year = 2000 + parseInt(yymmdd.slice(0, 2), 10);
  const month = parseInt(yymmdd.slice(2, 4), 10);
  let day = parseInt(yymmdd.slice(4, 6), 10);
  if (month < 1 || month > 12) return null;
  if (day === 0) day = new Date(year, month, 0).getDate(); // ultimo dia del mes
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Extrae el NDC de 10 digitos de un GTIN-14 farmaceutico.
 * Estructura: [indicador][0][3][NDC 10 digitos][digito verificador]
 * El "03" en posiciones 1-2 identifica un GTIN basado en NDC.
 */
export function ndcDesdeGtin(gtin14) {
  if (!/^\d{14}$/.test(gtin14)) return null;
  if (gtin14.slice(1, 3) !== '03') return null;
  return gtin14.slice(3, 13);
}

/**
 * Un NDC de 10 digitos sin guiones es ambiguo: el cero de relleno puede
 * ir en cualquiera de los 3 segmentos. Devuelve las 3 normalizaciones
 * posibles a 11 digitos (5-4-2) para buscar en el catalogo.
 */
export function candidatosNdc11(ndc10) {
  if (!/^\d{10}$/.test(ndc10)) return [];
  return [
    '0' + ndc10,                                    // original 4-4-2
    ndc10.slice(0, 5) + '0' + ndc10.slice(5),       // original 5-3-2
    ndc10.slice(0, 9) + '0' + ndc10.slice(9),       // original 5-4-1
  ];
}

function parsearLegible(texto) {
  // Formato legible: (01)00304099094011(17)270131(10)LOTE123
  const campos = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    campos[m[1]] = m[2].replace(new RegExp(GS, 'g'), '').trim();
  }
  return campos;
}

function parsearCrudo(texto) {
  // Algunos lectores anteponen el identificador AIM (ej. "]d2" para DataMatrix)
  let s = texto.replace(/^\][A-Za-z]\d/, '');
  const campos = {};
  let i = 0;
  while (i < s.length - 1) {
    if (s[i] === GS) { i += 1; continue; }
    const ai2 = s.slice(i, i + 2);
    const ai3 = s.slice(i, i + 3);
    if (FIXED_AIS[ai2] !== undefined) {
      campos[ai2] = s.slice(i + 2, i + 2 + FIXED_AIS[ai2]);
      i += 2 + FIXED_AIS[ai2];
    } else if (VARIABLE_AIS.includes(ai2) || VARIABLE_AIS.includes(ai3)) {
      const ai = VARIABLE_AIS.includes(ai3) && !VARIABLE_AIS.includes(ai2) ? ai3 : ai2;
      const inicio = i + ai.length;
      const fin = s.indexOf(GS, inicio);
      campos[ai] = fin === -1 ? s.slice(inicio) : s.slice(inicio, fin);
      i = fin === -1 ? s.length : fin + 1;
    } else {
      break; // AI desconocido — no seguir adivinando
    }
  }
  return campos;
}

/**
 * Parsea el texto decodificado de un escaneo.
 *
 * Retorna:
 *   { esGS1, gtin, ndc10, candidatosNdc, lote, fechaCaducidad, serial, crudo }
 * Si el texto no es GS1 (codigo de barras simple), esGS1 = false y el
 * llamador puede intentar igualarlo contra codigo_barras del catalogo.
 */
export function parsearGS1(texto) {
  if (!texto) return { esGS1: false, crudo: texto || '' };

  const campos = texto.includes('(') ? parsearLegible(texto) : parsearCrudo(texto);

  if (!campos['01'] && !campos['17'] && !campos['10']) {
    return { esGS1: false, crudo: texto };
  }

  const gtin = campos['01'] || null;
  const ndc10 = gtin ? ndcDesdeGtin(gtin) : null;

  return {
    esGS1: true,
    crudo: texto,
    gtin,
    ndc10,
    candidatosNdc: ndc10 ? candidatosNdc11(ndc10) : [],
    lote: campos['10'] || '',
    fechaCaducidad: campos['17'] ? parsearFechaGS1(campos['17']) : null,
    serial: campos['21'] || '',
  };
}
