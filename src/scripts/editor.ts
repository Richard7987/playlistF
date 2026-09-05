import { parseTime, shiftLines, type Dedication, type Line } from '../lib/time';

interface EdTrack {
  slug: string;
  title: string;
  artist: string;
  streamUrl: string;
  duration: number;
  lines: Line[];
  synced: boolean;
}

const raw = document.getElementById('ed-data')?.textContent;
if (raw && document.getElementById('track')) {
  run(JSON.parse(raw) as { tracks: EdTrack[]; dedications: Record<string, Dedication> });
}

function fmt(s: number): string {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${rest}`;
}
function mmss(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function run(data: { tracks: EdTrack[]; dedications: Record<string, Dedication> }) {
  const $ = <E extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as E;
  const trackSel = $<HTMLSelectElement>('track');
  const audio = new Audio();
  audio.preload = 'metadata';
  const playBtn = $<HTMLButtonElement>('play');
  const seek = $<HTMLInputElement>('seek');
  const timeEl = $('time');
  const offsetEl = $('offset');
  const lyricsEl = $('lyrics');
  const dedicationEl = $<HTMLTextAreaElement>('dedication');
  const fragEl = $<HTMLInputElement>('fragmentNote');
  const srcEl = $<HTMLSelectElement>('lyricsSource');
  const markState = $('mark-state');
  const outEl = $('out');

  let cur = 0;
  let offset = 0;
  let lines: Line[] = [];
  let entry: Dedication = {};

  data.tracks.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${t.artist} — ${t.title}`;
    trackSel.appendChild(o);
  });

  function shifted(): Line[] {
    return shiftLines(data.tracks[cur].lines, offset);
  }

  function renderLyrics() {
    lines = shifted();
    lyricsEl.replaceChildren();
    lines.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'ed-line';
      row.dataset.i = String(i);
      if (l.t != null) row.dataset.t = String(l.t);
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = l.t != null ? mmss(l.t) : '';
      const txt = document.createElement('span');
      txt.textContent = l.text;
      row.append(t, txt);
      lyricsEl.appendChild(row);
    });
    paintMarks();
    highlight();
  }

  function markedSet(): Set<number> {
    const from = parseTime(entry.highlightFrom);
    const to = parseTime(entry.highlightTo);
    const at = parseTime(entry.highlightAt);
    const out = new Set<number>();
    if (from != null && to != null) {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      lines.forEach((l, i) => l.t != null && l.t >= lo && l.t <= hi && out.add(i));
    } else if (at != null) {
      let best = -1;
      lines.forEach((l, i) => l.t != null && l.t <= at && (best = i));
      if (best >= 0) out.add(best);
    }
    return out;
  }

  function paintMarks() {
    const m = markedSet();
    [...lyricsEl.children].forEach((row, i) => row.classList.toggle('mark', m.has(i)));
    const parts: string[] = [];
    if (entry.highlightAt) parts.push(`at ${entry.highlightAt}`);
    if (entry.highlightFrom) parts.push(`from ${entry.highlightFrom}`);
    if (entry.highlightTo) parts.push(`to ${entry.highlightTo}`);
    markState.textContent = parts.length ? parts.join('  ') : 'sin marca';
  }

  function highlight() {
    let ai = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t != null && audio.currentTime >= (lines[i].t as number)) ai = i;
    }
    [...lyricsEl.children].forEach((row, i) => row.classList.toggle('on', i === ai));
  }

  function buildOut() {
    const e: Dedication = {};
    const ded = dedicationEl.value.trim();
    if (ded) e.dedication = ded;
    if (entry.highlightAt) e.highlightAt = entry.highlightAt;
    if (entry.highlightFrom) e.highlightFrom = entry.highlightFrom;
    if (entry.highlightTo) e.highlightTo = entry.highlightTo;
    const fn = fragEl.value.trim();
    if (fn) e.fragmentNote = fn;
    if (offset) e.lyricsOffset = Math.round(offset * 100) / 100;
    if (srcEl.value) e.lyricsSource = srcEl.value as Dedication['lyricsSource'];
    outEl.textContent = Object.keys(e).length
      ? JSON.stringify({ [data.tracks[cur].slug]: e }, null, 2).slice(1, -1).replace(/^\n/, '').replace(/\n$/, '')
      : '(nada que guardar)';
  }

  function refresh() {
    paintMarks();
    buildOut();
  }

  function loadTrack(i: number) {
    cur = i;
    const t = data.tracks[cur];
    entry = { ...(data.dedications[t.slug] ?? {}) };
    offset = Number(entry.lyricsOffset) || 0;
    offsetEl.textContent = String(offset);
    dedicationEl.value = entry.dedication ?? '';
    fragEl.value = entry.fragmentNote ?? '';
    srcEl.value = entry.lyricsSource ?? '';
    audio.src = t.streamUrl;
    audio.currentTime = 0;
    renderLyrics();
    buildOut();
  }

  trackSel.addEventListener('change', () => loadTrack(Number(trackSel.value)));
  playBtn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  audio.addEventListener('play', () => (playBtn.textContent = '⏸'));
  audio.addEventListener('pause', () => (playBtn.textContent = '▶'));
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || data.tracks[cur].duration || 1;
    seek.value = String(Math.round((audio.currentTime / d) * 1000));
    timeEl.textContent = `${mmss(audio.currentTime)} / ${mmss(d)}`;
    highlight();
  });
  seek.addEventListener('input', () => {
    const d = audio.duration || data.tracks[cur].duration || 1;
    audio.currentTime = (Number(seek.value) / 1000) * d;
  });

  lyricsEl.addEventListener('click', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('.ed-line');
    if (!row?.dataset.t) return;
    audio.currentTime = Number(row.dataset.t) - offset;
    if (audio.paused) audio.play().catch(() => {});
  });

  document.querySelectorAll<HTMLButtonElement>('[data-off]').forEach((b) =>
    b.addEventListener('click', () => {
      offset = Math.round((offset + Number(b.dataset.off)) * 100) / 100;
      offsetEl.textContent = String(offset);
      renderLyrics();
      buildOut();
    }),
  );

  $('mark-at').addEventListener('click', () => {
    entry = { ...entry, highlightAt: fmt(audio.currentTime), highlightFrom: undefined, highlightTo: undefined };
    refresh();
  });
  $('mark-from').addEventListener('click', () => {
    entry = { ...entry, highlightFrom: fmt(audio.currentTime), highlightAt: undefined };
    refresh();
  });
  $('mark-to').addEventListener('click', () => {
    entry = { ...entry, highlightTo: fmt(audio.currentTime), highlightAt: undefined };
    refresh();
  });
  $('mark-clear').addEventListener('click', () => {
    entry = { ...entry, highlightAt: undefined, highlightFrom: undefined, highlightTo: undefined };
    refresh();
  });

  dedicationEl.addEventListener('input', buildOut);
  fragEl.addEventListener('input', buildOut);
  srcEl.addEventListener('change', buildOut);
  $('copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(outEl.textContent || '').then(() => {
      const c = $('copy');
      c.textContent = 'copiado';
      setTimeout(() => (c.textContent = 'copiar'), 1200);
    });
  });

  loadTrack(0);
}
