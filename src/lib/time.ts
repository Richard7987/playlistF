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
  // segundos sumados a cada tiempo de la letra; + si va adelantada, - si va atrasada
  lyricsOffset?: number;
  // fuerza / omite la fuente de letra en el próximo `npm run pull`
  lyricsSource?: 'lrclib' | 'embedded' | 'none';
}

export function shiftLines(lines: Line[], offset: number): Line[] {
  if (!offset) return lines;
  return lines.map((l) => ({
    text: l.text,
    t: l.t == null ? null : Math.max(0, Math.round((l.t + offset) * 100) / 100),
  }));
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
  const to = parseTime(d.highlightTo);
  const at = parseTime(d.highlightAt);
  // rango: highlightFrom..highlightTo, o highlightAt..highlightTo si no hay highlightFrom
  const from = parseTime(d.highlightFrom) ?? (to != null ? at : null);

  if (from != null && to != null) {
    // el LRC trae decimales; una línea entra si empieza dentro del segundo indicado
    const lo = Math.floor(Math.min(from, to));
    const hi = Math.floor(Math.max(from, to)) + 1;
    const out: number[] = [];
    lines.forEach((l, i) => {
      if (l.t != null && l.t >= lo && l.t < hi) out.push(i);
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
