import { describe, expect, it } from 'vitest';
import { markedIndices, parseTime, shiftLines, type Line } from './time';

describe('parseTime', () => {
  it('parsea m:ss', () => {
    expect(parseTime('2:41')).toBe(161);
    expect(parseTime('0:05')).toBe(5);
    expect(parseTime('10:00')).toBe(600);
  });
  it('parsea fracciones', () => {
    expect(parseTime('1:02.5')).toBeCloseTo(62.5);
  });
  it('parsea segundos sueltos', () => {
    expect(parseTime('161')).toBe(161);
    expect(parseTime(161)).toBe(161);
    expect(parseTime('12.34')).toBeCloseTo(12.34);
  });
  it('devuelve null para basura o vacío', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime('nope')).toBeNull();
    expect(parseTime('1:99')).toBeNull();
  });
});

describe('shiftLines', () => {
  const lines: Line[] = [
    { t: 10, text: 'a' },
    { t: 20, text: 'b' },
    { t: null, text: 'c' },
  ];
  it('sin offset devuelve el mismo array', () => {
    expect(shiftLines(lines, 0)).toBe(lines);
  });
  it('suma el offset y respeta null', () => {
    const out = shiftLines(lines, 1.5);
    expect(out[0].t).toBeCloseTo(11.5);
    expect(out[1].t).toBeCloseTo(21.5);
    expect(out[2].t).toBeNull();
  });
  it('no baja de 0', () => {
    expect(shiftLines(lines, -100)[0].t).toBe(0);
  });
});

describe('markedIndices', () => {
  const lines: Line[] = [
    { t: 0, text: 'l0' },
    { t: 30, text: 'l1' },
    { t: 60, text: 'l2' },
    { t: 90, text: 'l3' },
  ];
  it('rango: marca las líneas dentro de [from, to]', () => {
    expect(markedIndices({ highlightFrom: '0:30', highlightTo: '1:00' }, lines)).toEqual([1, 2]);
  });
  it('rango invertido: se ordena solo', () => {
    expect(markedIndices({ highlightFrom: '1:00', highlightTo: '0:30' }, lines)).toEqual([1, 2]);
  });
  it('rango con highlightAt + highlightTo (sin highlightFrom)', () => {
    expect(markedIndices({ highlightAt: '0:30', highlightTo: '1:00' }, lines)).toEqual([1, 2]);
  });
  it('punto: marca la línea activa en ese instante', () => {
    expect(markedIndices({ highlightAt: '1:05' }, lines)).toEqual([2]);
    expect(markedIndices({ highlightAt: '0:00' }, lines)).toEqual([0]);
  });
  it('sin marcas o sin letra devuelve []', () => {
    expect(markedIndices({}, lines)).toEqual([]);
    expect(markedIndices({ highlightAt: '1:00' }, [])).toEqual([]);
  });
  it('ignora líneas sin timestamp', () => {
    const mixed: Line[] = [{ t: null, text: 'x' }, { t: 10, text: 'y' }];
    expect(markedIndices({ highlightAt: '0:15' }, mixed)).toEqual([1]);
  });
});
