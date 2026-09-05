import gsap from 'gsap';
import Lenis from 'lenis';
import { MeshGradient, hexToRgb01, type RGB } from '../lib/gradient';

interface Track {
  slug: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  streamUrl: string;
  colors: { bg: string; bgAlt: string; accent: string; text: string; muted: string };
  synced: boolean;
  coverUrl: string | null;
  lines: { t: number | null; text: string }[];
  marked: number[];
  dedication: string | null;
  fragmentNote: string | null;
}

const dataEl = document.getElementById('tracks');
if (dataEl?.textContent) {
  const tracks = JSON.parse(dataEl.textContent) as Track[];
  if (tracks.length) start(tracks);
}

function mmss(s: number): string {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function start(tracks: Track[]) {
  const q = <E extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as E;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const glCanvas = q<HTMLCanvasElement>('#gl');
  const grad = new MeshGradient(glCanvas);
  if (grad.ok) grad.start();

  const cover = q<HTMLImageElement>('#cover');
  const titleEl = q('#title');
  const artistEl = q('#artist');
  const cCur = q('#c-cur');
  const dots = [...document.querySelectorAll<HTMLButtonElement>('#dots button')];
  const lyricsBox = q('#lyrics');
  const lyricsInner = q('#lyrics-inner');
  const fragNote = q('#frag-note');
  const dedCard = q('#ded-card');
  const dedText = q('#ded-text');
  const playBtn = q<HTMLButtonElement>('#play');
  const playIcon = q('#play-icon');
  const scrub = q('#scrub');
  const scrubFill = q('#scrub-fill');
  const scrubKnob = q('#scrub-knob');
  const tCur = q('#t-cur');
  const tDur = q('#t-dur');

  const audio = new Audio();
  audio.preload = 'metadata';

  const lenis = new Lenis({ duration: 1.05, easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)) });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  let idx = 0;
  let started = false;

  const rgbFor = (c: Track['colors']): RGB[] => [
    hexToRgb01(c.bg),
    hexToRgb01(c.bgAlt),
    hexToRgb01(c.accent),
    [0.02, 0.02, 0.03],
  ];

  function applyColors(c: Track['colors'], instant: boolean) {
    const s = document.documentElement.style;
    s.setProperty('--bg', c.bg);
    s.setProperty('--bg-alt', c.bgAlt);
    s.setProperty('--accent', c.accent);
    s.setProperty('--text', c.text);
    s.setProperty('--muted', c.muted);
    if (grad.ok) grad.setColors(rgbFor(c), instant);
  }

  function renderLyrics(t: Track) {
    lyricsInner.innerHTML = '';
    if (!t.lines.length) {
      lyricsInner.innerHTML = '<p class="lyrics-empty">sin letra</p>';
      return;
    }
    const marked = new Set(t.marked);
    t.lines.forEach((l, i) => {
      const d = document.createElement('div');
      d.className = 'line' + (marked.has(i) ? ' marked' : '');
      if (l.t != null) d.dataset.t = String(l.t);
      d.textContent = l.text;
      lyricsInner.appendChild(d);
    });
  }

  function setPlaying(v: boolean) {
    playIcon.innerHTML = v ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    playBtn.setAttribute('aria-label', v ? 'Pausar' : 'Reproducir');
  }

  function tick(snap = false) {
    const t = tracks[idx];
    const kids = [...lyricsInner.querySelectorAll<HTMLElement>('.line')];
    const times = t.lines.map((l) => l.t);
    const hasSync = t.synced && times.some((x) => x != null);

    let ai = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] != null && audio.currentTime >= (times[i] as number)) ai = i;
    }

    kids.forEach((k, i) => {
      const dist = Math.abs(i - ai);
      k.classList.toggle('active', hasSync && i === ai);
      k.classList.toggle('near', hasSync && dist === 1);
      k.classList.toggle('far', hasSync && (dist === 2 || dist === 3));
      k.classList.toggle('farther', hasSync && dist >= 4);
      if (!hasSync) k.style.opacity = '0.5';
    });

    if (hasSync && kids[ai]) {
      const curT = (times[ai] as number) ?? 0;
      let nextT = t.duration;
      for (let i = ai + 1; i < times.length; i++) {
        if (times[i] != null) {
          nextT = times[i] as number;
          break;
        }
      }
      const wipe = Math.max(0, Math.min(1, (audio.currentTime - curT) / Math.max(0.1, nextT - curT)));
      kids[ai].style.setProperty('--wipe', `${(wipe * 100).toFixed(1)}%`);

      const y = kids[ai].offsetTop + kids[ai].offsetHeight / 2 - lyricsBox.clientHeight / 2;
      lyricsInner.style.transition = snap ? 'none' : '';
      lyricsInner.style.transform = `translateY(${-y}px)`;
      if (snap) void lyricsInner.offsetHeight;
    }

    const dur = audio.duration || t.duration;
    const pct = dur ? Math.min(100, (audio.currentTime / dur) * 100) : 0;
    scrubFill.style.width = `${pct}%`;
    scrubKnob.style.left = `${pct}%`;
    tCur.textContent = mmss(audio.currentTime);
  }

  function swap(t: Track, instant: boolean) {
    if (t.coverUrl) {
      cover.src = t.coverUrl;
      cover.style.background = '';
    } else {
      cover.removeAttribute('src');
      cover.style.background = 'linear-gradient(160deg, var(--bg-alt), var(--bg))';
    }
    titleEl.textContent = t.title;
    artistEl.textContent = t.album ? `${t.artist} — ${t.album}` : t.artist;
    cCur.textContent = String(idx + 1).padStart(2, '0');
    dots.forEach((b, i) => b.toggleAttribute('aria-current', i === idx));
    renderLyrics(t);
    dedCard.hidden = !t.dedication;
    dedText.textContent = t.dedication ?? '';
    fragNote.hidden = !t.fragmentNote;
    fragNote.textContent = t.fragmentNote ?? '';
    tDur.textContent = mmss(t.duration);
    applyColors(t.colors, instant);
    audio.src = t.streamUrl || '';
    audio.currentTime = 0;
    tick(true);
  }

  function show(n: number, instant = false) {
    idx = (n + tracks.length) % tracks.length;
    const t = tracks[idx];
    const wasPlaying = started && !audio.paused;
    audio.pause();

    if (instant || reduce) {
      swap(t, true);
      if (wasPlaying) audio.play().catch(() => {});
      return;
    }

    const group = ['.art-wrap', '.left .meta', '.right', '.dedication'];
    gsap
      .timeline()
      .to(group, { opacity: 0, y: 8, duration: 0.2, ease: 'power2.in' })
      .add(() => {
        swap(t, false);
        if (wasPlaying) audio.play().catch(() => {});
      })
      .fromTo(group, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out' });
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener('play', () => {
    started = true;
    setPlaying(true);
    raf();
  });
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('timeupdate', () => tick());
  audio.addEventListener('ended', () => show(idx + 1));

  let rafId = 0;
  function raf() {
    cancelAnimationFrame(rafId);
    const loop = () => {
      if (audio.paused) return;
      tick();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  q('#prev').addEventListener('click', () => show(idx - 1));
  q('#next').addEventListener('click', () => show(idx + 1));
  dots.forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i))));

  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      playBtn.click();
    }
  });

  let dragging = false;
  const seek = (clientX: number) => {
    const r = scrub.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    audio.currentTime = ratio * (audio.duration || tracks[idx].duration);
    tick();
  };
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seek(e.clientX);
  });
  scrub.addEventListener('pointermove', (e) => dragging && seek(e.clientX));
  scrub.addEventListener('pointerup', () => (dragging = false));

  let sx = 0;
  const stage = q('.stage');
  stage.addEventListener('pointerdown', (e) => {
    if (!(e.target as Element).closest('.scrub')) sx = e.clientX;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!sx) return;
    const dx = e.clientX - sx;
    sx = 0;
    if (Math.abs(dx) > 60) show(idx + (dx < 0 ? 1 : -1));
  });

  show(0, true);
}
