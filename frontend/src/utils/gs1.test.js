/**
 * Pruebas del parser GS1 (Fase 4).
 * GTIN de prueba: indicador 0 + "03" + NDC10 0409909401 + verificador.
 */
import { parsearGS1, parsearFechaGS1, ndcDesdeGtin, candidatosNdc11 } from './gs1';

const GS = String.fromCharCode(29);
const GTIN = '00304099094012';

describe('parsearFechaGS1', () => {
  test('fecha normal YYMMDD', () => {
    expect(parsearFechaGS1('270131')).toBe('2027-01-31');
  });

  test('dia 00 usa el ultimo dia del mes', () => {
    expect(parsearFechaGS1('270200')).toBe('2027-02-28');
    expect(parsearFechaGS1('280200')).toBe('2028-02-29'); // bisiesto
  });

  test('entradas invalidas', () => {
    expect(parsearFechaGS1('271331')).toBeNull(); // mes 13
    expect(parsearFechaGS1('27013')).toBeNull();
    expect(parsearFechaGS1('')).toBeNull();
  });
});

describe('ndcDesdeGtin', () => {
  test('extrae el NDC10 de un GTIN farmaceutico', () => {
    expect(ndcDesdeGtin(GTIN)).toBe('0409909401');
  });

  test('GTIN con indicador de nivel de empaque distinto de 0', () => {
    expect(ndcDesdeGtin('20304099094016')).toBe('0409909401');
  });

  test('rechaza GTIN no farmaceutico (sin prefijo 03)', () => {
    expect(ndcDesdeGtin('10412345678907')).toBeNull();
  });
});

describe('candidatosNdc11', () => {
  test('genera las 3 normalizaciones posibles', () => {
    expect(candidatosNdc11('0409909401')).toEqual([
      '00409909401', // 4-4-2
      '04099009401', // 5-3-2
      '04099094001', // 5-4-1
    ]);
  });
});

describe('parsearGS1', () => {
  test('cadena cruda con campos fijos y lote al final', () => {
    const r = parsearGS1(`01${GTIN}1727013110LOTE1A`);
    expect(r.esGS1).toBe(true);
    expect(r.gtin).toBe(GTIN);
    expect(r.ndc10).toBe('0409909401');
    expect(r.candidatosNdc).toContain('00409909401');
    expect(r.fechaCaducidad).toBe('2027-01-31');
    expect(r.lote).toBe('LOTE1A');
  });

  test('lote variable terminado en GS seguido de fecha y serial', () => {
    const r = parsearGS1(`01${GTIN}10AB12${GS}1727013121SER001`);
    expect(r.lote).toBe('AB12');
    expect(r.fechaCaducidad).toBe('2027-01-31');
    expect(r.serial).toBe('SER001');
  });

  test('prefijo AIM de lector DataMatrix', () => {
    const r = parsearGS1(`]d201${GTIN}17270131`);
    expect(r.esGS1).toBe(true);
    expect(r.ndc10).toBe('0409909401');
  });

  test('formato legible con parentesis', () => {
    const r = parsearGS1(`(01)${GTIN}(17)270131(10)LOTE1A`);
    expect(r.esGS1).toBe(true);
    expect(r.ndc10).toBe('0409909401');
    expect(r.fechaCaducidad).toBe('2027-01-31');
    expect(r.lote).toBe('LOTE1A');
  });

  test('codigo de barras simple no es GS1', () => {
    const r = parsearGS1('MED-INTERNO-123');
    expect(r.esGS1).toBe(false);
    expect(r.crudo).toBe('MED-INTERNO-123');
  });

  test('texto vacio', () => {
    expect(parsearGS1('').esGS1).toBe(false);
  });
});
