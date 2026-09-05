// Parseo de tiempos ("m:ss" o segundos) y resolución de las líneas a resaltar.

export interface Line {
  t: number | null;
  text: string;
}

export interface Dedication {
  dedication?: string;
  highlightAt?: string | number;
  highlightFrom?: string | number;
  highlightTo?: string | number;
  fragmentNote?: string;
}

export function parseTime(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^(\d+):([0-5]?\d)(?:\.(\d+))?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** Índices de las líneas marcadas por la dedicatoria (rango o punto). */
export function markedIndices(d: Dedication, lines: Line[]): number[] {
  if (!lines.length) return [];
  const from = parseTime(d.highlightFrom);
  const to = parseTime(d.highlightTo);
  const at = parseTime(d.highlightAt);

  if (from != null && to != null) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const out: number[] = [];
    lines.forEach((l, i) => {
      if (l.t != null && l.t >= lo && l.t <= hi) out.push(i);
    });
    return out;
  }

  if (at != null) {
    let best = -1;
    lines.forEach((l, i) => {
      if (l.t != null && l.t <= at) best = i;
    });
    return best >= 0 ? [best] : [];
  }

  return [];
}
