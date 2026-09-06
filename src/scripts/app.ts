import gsap from 'gsap';
import { registerSW } from 'virtual:pwa-register';
import { MeshGradient, hexToRgb01, type RGB } from '../lib/gradient';

registerSW({ immediate: true });

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

  const wrapEl = q('.wrap');
  let coverFront = q<HTMLImageElement>('#cover-a');
  let coverBack = q<HTMLImageElement>('#cover-b');
  const titleEl = q('#title');
  const artistEl = q('#artist');
  const queueToggle = q<HTMLButtonElement>('#queue-toggle');
  const queue = q('#queue');
  const queuePanel = q('.queue-panel');
  const queueClose = q<HTMLButtonElement>('#queue-close');
  const queueItems = [...document.querySelectorAll<HTMLButtonElement>('.queue-item')];
  const loadError = q('#load-error');
  const lyricsBox = q('#lyrics');
  const lyricsInner = q('#lyrics-inner');
  const fragNote = q('#frag-note');
  const dedWrap = q('#dedication');
  const dedText = q('#ded-text');
  const playBtn = q<HTMLButtonElement>('#play');
  const playIcon = q('#play-icon');
  const scrub = q('#scrub');
  const scrubFill = q('#scrub-fill');
  const scrubBuffer = q('#scrub-buffer');
  const scrubKnob = q('#scrub-knob');
  const muteBtn = q<HTMLButtonElement>('#mute');
  const volIcon = q('#vol-icon');
  const volInput = q<HTMLInputElement>('#vol');
  const tCur = q('#t-cur');
  const tDur = q('#t-dur');

  const audio = new Audio();
  audio.preload = 'metadata';

  let idx = 0;
  let wantPlaying = false;

  let lineEls: HTMLElement[] = [];
  let lineTimes: (number | null)[] = [];
  let syncedNow = false;
  let curAi = -2;
  let lyricsH = 0;
  let lastSec = -1;

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
    curAi = -2;
    lastSec = -1;
    syncedNow = hasSync(t);
    lineTimes = t.lines.map((l) => l.t);
    lyricsH = lyricsBox.clientHeight;

    if (!t.lines.length) {
      lyricsInner.innerHTML = '<p class="lyrics-empty">sin letra</p>';
      lineEls = [];
      return;
    }
    const marked = new Set(t.marked);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < t.lines.length; i++) {
      const line = t.lines[i];
      const d = document.createElement('div');
      d.className = marked.has(i) ? 'line marked' : 'line';
      d.textContent = line.text;
      if (syncedNow && line.t != null) d.dataset.seek = String(line.t);
      frag.appendChild(d);
    }
    lyricsInner.replaceChildren(frag);
    lineEls = [...lyricsInner.children] as HTMLElement[];
  }

  function setPlaying(v: boolean) {
    playIcon.innerHTML = v ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    playBtn.setAttribute('aria-label', v ? 'Pausar' : 'Reproducir');
  }

  const hasSync = (t: Track) => t.synced && t.lines.some((l) => l.t != null);

  function tick(force = false) {
    if (force) lyricsH = lyricsBox.clientHeight;
    const ct = audio.currentTime;
    const dur = audio.duration || tracks[idx].duration || 1;
    const pct = Math.min(100, Math.max(0, (ct / dur) * 100));
    scrubFill.style.width = `${pct}%`;
    scrubKnob.style.left = `${pct}%`;

    if (audio.buffered.length) {
      scrubBuffer.style.width = `${Math.min(100, (audio.buffered.end(audio.buffered.length - 1) / dur) * 100)}%`;
    }

    const sec = ct | 0;
    if (sec !== lastSec || force) {
      lastSec = sec;
      tCur.textContent = mmss(ct);
      persist();
      if ('mediaSession' in navigator && isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(ct, audio.duration),
          });
        } catch {
          /* algunos navegadores lo rechazan */
        }
      }
    }

    if (!syncedNow) return;

    let ai = -1;
    for (let i = 0; i < lineTimes.length; i++) {
      const lt = lineTimes[i];
      if (lt == null) continue;
      if (ct >= lt) ai = i;
      else break;
    }
    if (ai === curAi && !force) return;
    curAi = ai;

    const ref = ai < 0 ? 0 : ai;
    for (let i = 0; i < lineEls.length; i++) {
      const d = Math.abs(i - ref);
      const cl = lineEls[i].classList;
      cl.toggle('active', i === ai);
      cl.toggle('near', d === 1 || (ai < 0 && d === 0));
      cl.toggle('far', d === 2 || d === 3);
      cl.toggle('farther', d >= 4);
    }

    const el = lineEls[ref];
    if (el) {
      if (force) lyricsInner.style.transition = 'none';
      lyricsInner.style.transform = `translateY(${(lyricsH / 2 - el.offsetTop - el.offsetHeight / 2).toFixed(1)}px)`;
      if (force) {
        void lyricsInner.offsetHeight;
        lyricsInner.style.transition = '';
      }
    }
  }

  function updateMediaSession(t: Track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: t.coverUrl
        ? [{ src: new URL(t.coverUrl, location.href).href, sizes: '640x640', type: 'image/jpeg' }]
        : [],
    });
  }

  function persist() {
    try {
      localStorage.setItem('fa:last', JSON.stringify({ slug: tracks[idx].slug, t: Math.floor(audio.currentTime) }));
    } catch {
      /* modo privado / bloqueado */
    }
  }

  function swapCover(url: string | null, instant: boolean) {
    const back = coverBack;
    back.onload = null;
    back.onerror = null;
    const finish = () => {
      if (instant || reduce) {
        gsap.set(back, { opacity: 1 });
        gsap.set(coverFront, { opacity: 0 });
      } else {
        gsap.to(back, { opacity: 1, duration: 0.55, ease: 'power2.out', overwrite: true });
        gsap.to(coverFront, { opacity: 0, duration: 0.55, ease: 'power2.out', overwrite: true });
      }
      [coverFront, coverBack] = [back, coverFront];
    };
    if (url) {
      back.style.background = '';
      if (back.getAttribute('src') === url) finish();
      else {
        back.onload = finish;
        back.onerror = finish;
        back.src = url;
      }
    } else {
      back.removeAttribute('src');
      back.style.background = 'linear-gradient(160deg, var(--bg-alt), var(--bg))';
      finish();
    }
  }

  function swap(t: Track, instant: boolean, seekTo = 0) {
    swapCover(t.coverUrl, instant);
    titleEl.textContent = t.title;
    artistEl.textContent = t.album ? `${t.artist} — ${t.album}` : t.artist;
    queueItems.forEach((b, i) => b.toggleAttribute('aria-current', i === idx));
    const synced = hasSync(t);
    wrapEl.classList.toggle('no-lyrics', !t.lines.length);
    wrapEl.classList.toggle('no-dedication', !t.dedication);
    lyricsBox.classList.toggle('unsynced', t.lines.length > 0 && !synced);
    if (!synced) {
      lyricsInner.style.transition = 'none';
      lyricsInner.style.transform = 'none';
    }
    renderLyrics(t);
    dedWrap.hidden = !t.dedication;
    dedText.textContent = t.dedication ?? '';
    fragNote.hidden = !t.fragmentNote;
    fragNote.textContent = t.fragmentNote ?? '';
    tDur.textContent = mmss(t.duration);
    applyColors(t.colors, instant);
    updateMediaSession(t);
    loadError.hidden = true;
    audio.src = t.streamUrl || '';
    if (seekTo > 0) {
      const onMeta = () => {
        audio.currentTime = seekTo;
        audio.removeEventListener('loadedmetadata', onMeta);
      };
      audio.addEventListener('loadedmetadata', onMeta);
    } else {
      audio.currentTime = 0;
    }
    history.replaceState(null, '', `#${t.slug}`);
    persist();
    tick(true);
  }

  function resume() {
    if (wantPlaying) audio.play().catch(() => {});
  }

  const frameMax = { v: 1140 };
  const setFrameMax = (v: number) => {
    frameMax.v = v;
    wrapEl.style.setProperty('--frame-max', `${v}px`);
  };

  const OUT = ['.left .meta', '.right', '.dedication'];
  let tl: gsap.core.Timeline | null = null;

  function show(n: number, instant = false, seekTo = 0) {
    idx = (n + tracks.length) % tracks.length;
    const t = tracks[idx];
    const target = t.lines.length ? 1140 : 560;
    audio.pause();
    tl?.kill();
    gsap.killTweensOf([...OUT, frameMax]);
    clearPreload();

    if (instant || reduce) {
      setFrameMax(target);
      swap(t, true, seekTo);
      gsap.set(OUT, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' });
      resume();
      return;
    }

    tl = gsap.timeline({
      defaults: { ease: 'power3.inOut', overwrite: 'auto' },
      onComplete: () => {
        gsap.set(OUT, { clearProps: 'opacity,transform' });
        tick(true);
      },
    });
    tl.to(OUT, { opacity: 0, y: 6, duration: 0.28 }, 0)
      .to(frameMax, { v: target, duration: 0.62, onUpdate: () => setFrameMax(frameMax.v) }, 0)
      .add(() => {
        swap(t, false, seekTo);
        resume();
      }, 0.26)
      .fromTo(
        ['.left .meta', '.right', '.dedication'],
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 },
        0.34,
      );
  }

  playBtn.addEventListener('click', () => {
    wantPlaying = audio.paused;
    if (wantPlaying) audio.play().catch(() => {});
    else audio.pause();
  });

  function updateVolIcon() {
    const off = audio.muted || audio.volume === 0;
    const low = audio.volume < 0.5;
    volIcon.innerHTML = off
      ? '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M15 9l6 6M21 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : low
        ? '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        : '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    muteBtn.setAttribute('aria-label', off ? 'Activar sonido' : 'Silenciar');
  }
  function setVolume(v: number, save = true) {
    audio.volume = Math.max(0, Math.min(1, v));
    audio.muted = false;
    volInput.value = String(audio.volume);
    if (save) {
      try {
        localStorage.setItem('fa:vol', String(audio.volume));
      } catch {
        /* almacenamiento no disponible */
      }
    }
    updateVolIcon();
  }
  let storedVol = 1;
  try {
    const raw = localStorage.getItem('fa:vol');
    const v = raw == null ? NaN : Number(raw);
    if (v >= 0 && v <= 1) storedVol = v;
  } catch {
    /* almacenamiento no disponible */
  }
  setVolume(storedVol, false);
  volInput.addEventListener('input', () => setVolume(Number(volInput.value)));
  muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    updateVolIcon();
  });

  let preloadEl: HTMLAudioElement | null = null;
  let preloadTimer = 0;
  function schedulePreload() {
    clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(() => {
      const next = tracks[(idx + 1) % tracks.length];
      if (!next.streamUrl) return;
      preloadEl = new Audio();
      preloadEl.preload = 'auto';
      preloadEl.src = next.streamUrl;
    }, 4000);
  }
  function clearPreload() {
    clearTimeout(preloadTimer);
    if (preloadEl) {
      preloadEl.removeAttribute('src');
      preloadEl = null;
    }
  }

  audio.addEventListener('play', () => {
    wantPlaying = true;
    setPlaying(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    raf();
    schedulePreload();
  });
  audio.addEventListener('pause', () => {
    setPlaying(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });
  audio.addEventListener('loadedmetadata', () => tick(true));
  audio.addEventListener('loadeddata', () => (loadError.hidden = true));
  audio.addEventListener('timeupdate', () => tick());
  audio.addEventListener('seeked', () => tick(true));
  audio.addEventListener('ended', () => show(idx + 1));
  audio.addEventListener('error', () => {
    if (audio.src) loadError.hidden = false;
  });

  let resizeRaf = 0;
  addEventListener(
    'resize',
    () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        lyricsH = lyricsBox.clientHeight;
        tick(true);
      });
    },
    { passive: true },
  );

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

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => audio.play().catch(() => {}));
    ms.setActionHandler('pause', () => audio.pause());
    ms.setActionHandler('previoustrack', () => show(idx - 1));
    ms.setActionHandler('nexttrack', () => show(idx + 1));
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) {
        audio.currentTime = d.seekTime;
        tick(true);
      }
    });
  }

  lyricsInner.addEventListener('click', (e) => {
    if (!syncedNow) return;
    const line = (e.target as Element).closest<HTMLElement>('.line');
    const s = line?.dataset.seek;
    if (s == null) return;
    audio.currentTime = Number(s);
    if (!wantPlaying) {
      wantPlaying = true;
      audio.play().catch(() => {});
    }
    tick(true);
  });

  addEventListener('hashchange', () => {
    const s = decodeURIComponent(location.hash.slice(1));
    const i = tracks.findIndex((x) => x.slug === s);
    if (i >= 0 && i !== idx) show(i);
  });
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });

  let queueTimer = 0;
  function setQueue(open: boolean) {
    clearTimeout(queueTimer);
    queueToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      queue.hidden = false;
      requestAnimationFrame(() => {
        queue.classList.add('open');
        queueItems[idx]?.scrollIntoView({ block: 'center' });
        queueClose.focus();
      });
    } else {
      queue.classList.remove('open');
      queueTimer = window.setTimeout(() => (queue.hidden = true), reduce ? 0 : 380);
      queueToggle.focus();
    }
  }
  queueToggle.addEventListener('click', () => setQueue(queue.hidden));
  queueClose.addEventListener('click', () => setQueue(false));
  q('#queue-backdrop').addEventListener('click', () => setQueue(false));
  queueItems.forEach((b) =>
    b.addEventListener('click', () => {
      show(Number(b.dataset.i));
      setQueue(false);
    }),
  );
  queuePanel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [queueClose, ...queueItems];
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;
    if (!queuePanel.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !queue.hidden) return setQueue(false);
    if (e.target !== document.body || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = (s: number) => {
      audio.currentTime = Math.max(0, Math.min(audio.duration || tracks[idx].duration, audio.currentTime + s));
      tick(true);
    };
    switch (e.key) {
      case 'ArrowRight':
        show(idx + 1);
        break;
      case 'ArrowLeft':
        show(idx - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(audio.volume + 0.05);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(audio.volume - 0.05);
        break;
      case 'l':
        step(10);
        break;
      case 'j':
        step(-10);
        break;
      case 'm':
        muteBtn.click();
        break;
      case 'k':
      case ' ':
        e.preventDefault();
        playBtn.click();
        break;
    }
  });

  let dragging = false;
  const seek = (clientX: number) => {
    const r = scrub.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    audio.currentTime = ratio * (audio.duration || tracks[idx].duration);
    tick(true);
  };
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seek(e.clientX);
  });
  scrub.addEventListener('pointermove', (e) => {
    if (dragging) seek(e.clientX);
  });
  const endDrag = () => (dragging = false);
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);

  let sx = 0;
  let sy = 0;
  const stage = q('.stage');
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button, a, input, .scrub')) {
      sx = 0;
      return;
    }
    sx = e.clientX;
    sy = e.clientY;
  });
  stage.addEventListener('pointercancel', () => (sx = 0));
  stage.addEventListener('pointerup', (e) => {
    if (!sx) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    sx = 0;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) show(idx + (dx < 0 ? 1 : -1));
  });

  function initialState(): [number, number] {
    const hash = decodeURIComponent(location.hash.slice(1));
    const hi = tracks.findIndex((x) => x.slug === hash);
    if (hi >= 0) return [hi, 0];
    try {
      const raw = localStorage.getItem('fa:last');
      if (raw) {
        const { slug, t } = JSON.parse(raw);
        const li = tracks.findIndex((x) => x.slug === slug);
        if (li >= 0) {
          const at = typeof t === 'number' && t > 5 && t < tracks[li].duration - 10 ? t : 0;
          return [li, at];
        }
      }
    } catch {
      /* almacenamiento no disponible */
    }
    return [0, 0];
  }

  const [i0, t0] = initialState();
  show(i0, true, t0);
}
