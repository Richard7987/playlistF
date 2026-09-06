#!/usr/bin/env node
// Snapshot de la playlist "Fa" desde Navidrome → archivos estáticos que se commitean.
// Corre EN LOCAL (necesita .env con credenciales). CI nunca ejecuta esto.
//
//   npm run pull            # genera src/data/playlist.json + public/covers/*
//   npm run pull -- --allow-token   # permite el fallback autenticado (mete un token en el JSON)

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vibrant } from 'node-vibrant/node';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DATA = resolve(ROOT, 'src/data');
const OUT_COVERS = resolve(ROOT, 'public/covers');
const OUT_COVERS_TMP = resolve(ROOT, 'public/covers.tmp');

const {
  NAVIDROME_URL,
  NAVIDROME_USER,
  NAVIDROME_PASS,
  PLAYLIST_NAME = 'Fa',
  NAVIDROME_SHARE_FORMAT = 'mp3',
  NAVIDROME_SHARE_BITRATE = '128',
} = process.env;

const ALLOW_TOKEN = process.argv.includes('--allow-token');

if (!NAVIDROME_URL || !NAVIDROME_USER || !NAVIDROME_PASS) {
  console.error('✗ Falta configuración. Copia .env.example a .env y rellena NAVIDROME_URL / NAVIDROME_USER / NAVIDROME_PASS.');
  process.exit(1);
}

const BASE = NAVIDROME_URL.replace(/\/+$/, '');
const API_VERSION = '1.16.1';
const CLIENT = 'playlistF';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchT = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });

function authParams() {
  const salt = randomBytes(8).toString('hex');
  const token = createHash('md5').update(NAVIDROME_PASS + salt).digest('hex');
  return { u: NAVIDROME_USER, t: token, s: salt, v: API_VERSION, c: CLIENT, f: 'json' };
}

function restURL(method, params = {}) {
  const q = new URLSearchParams({ ...authParams(), ...params });
  return `${BASE}/rest/${method}?${q}`;
}

// URL de streaming autenticada (sin f=json). Fallback solo con --allow-token.
function authStreamURL(id) {
  const { f, ...a } = authParams();
  return `${BASE}/rest/stream?${new URLSearchParams({ ...a, id })}`;
}

async function sub(method, params = {}) {
  const res = await fetchT(restURL(method, params));
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = await res.json();
  const r = body['subsonic-response'];
  if (!r || r.status !== 'ok') {
    throw new Error(`${method}: ${r?.error?.message || 'respuesta no ok'}`);
  }
  return r;
}

const slugify = (s) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexToRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
};

const toHsl = (hex) => {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
};
const hslToHex = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
};

// Deriva una paleta vibrante y con contraste garantizado entre bg y bgAlt.
async function palette(buf) {
  let sw = {};
  try {
    sw = (await Vibrant.from(buf).getPalette()) || {};
  } catch (e) {
    console.warn(`  · paleta: ${e.message} — uso valores por defecto`);
  }
  const pick = (...names) => {
    for (const n of names) if (sw[n]?.hex) return sw[n].hex;
    return null;
  };

  const [ah, as, al] = toHsl(pick('Vibrant', 'LightVibrant', 'DarkVibrant', 'LightMuted') || '#e0a35c');
  const accent = hslToHex(ah, clamp(Math.max(as, 0.55), 0, 0.9), clamp(al, 0.5, 0.72));

  let [bh, bs] = toHsl(pick('DarkMuted', 'DarkVibrant', 'Muted') || '#1a1820');
  if (bs < 0.12) bh = ah;
  const bg = hslToHex(bh, clamp(Math.max(bs, 0.18), 0, 0.5), 0.1);

  let [th, ts] = toHsl(pick('DarkVibrant', 'Muted', 'Vibrant') || '#3a2f45');
  if (ts < 0.12) th = ah;
  const bgAlt = hslToHex(th, clamp(Math.max(ts, 0.22), 0, 0.55), 0.24);

  const text = hslToHex(bh, 0.14, 0.95);
  const muted = mix(text, bg, 0.44);
  return { bg, bgAlt, accent, text, muted };
}

// API nativa de Navidrome: sirve para crear un share que TRANSCODIFICA (format + maxBitRate),
// cosa que el createShare de Subsonic no permite. El transcode se fija al crear el share.
async function nativeLogin() {
  const res = await fetchT(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: NAVIDROME_USER, password: NAVIDROME_PASS }),
  });
  if (!res.ok) throw new Error(`auth/login: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.token) throw new Error('auth/login sin token');
  return {
    'x-nd-authorization': `Bearer ${body.token}`,
    'x-nd-client-unique-id': 'playlistF-pull',
    'content-type': 'application/json',
  };
}

async function nativeShare(headers, method, path, payload) {
  const res = await fetchT(`${BASE}/api/share${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`api/share ${method}: HTTP ${res.status} ${text.slice(0, 120)}`);
  return text ? JSON.parse(text) : {};
}

async function ensureShare(playlistId, songIds) {
  const tag = `playlistF:${PLAYLIST_NAME}`;
  const format = NAVIDROME_SHARE_FORMAT.trim().toLowerCase();
  const maxBitRate = Number(NAVIDROME_SHARE_BITRATE) || 0;
  const wantTranscode = format && format !== 'raw' && format !== 'original';

  let existing = null;
  try {
    const r = await sub('getShares');
    existing = (r.shares?.share || []).find((s) => s.description === tag) || null;
  } catch (e) {
    console.warn(`· getShares: ${e.message}`);
  }

  if (wantTranscode) {
    try {
      const headers = await nativeLogin();
      const payload = {
        description: tag,
        downloadable: false,
        resourceType: 'playlist',
        resourceIds: playlistId,
        format,
        maxBitRate,
      };
      const share = existing
        ? await nativeShare(headers, 'PUT', `/${existing.id}`, payload).then(() => ({ id: existing.id }))
        : await nativeShare(headers, 'POST', '', payload);
      const id = share.id || existing?.id;
      if (id) {
        console.log(`· share ${existing ? 'actualizado' : 'creado'} (${format} ${maxBitRate}k): ${BASE}/share/${id}`);
        return { id, url: `${BASE}/share/${id}`, expires: null };
      }
    } catch (e) {
      console.warn(`· share con transcode (${e.message}) — sigo con FLAC crudo`);
    }
  }

  if (existing?.url) {
    console.log(`· share reutilizado: ${existing.url}`);
    return { id: existing.id, url: existing.url.replace(/\/+$/, ''), expires: existing.expires || null };
  }
  for (const attempt of [{ id: playlistId }, ...(songIds.length ? [{ ids: songIds }] : [])]) {
    try {
      const params = attempt.id ? { id: attempt.id, description: tag } : { description: tag };
      const url = new URL(restURL('createShare', params));
      if (attempt.ids) for (const id of attempt.ids) url.searchParams.append('id', id);
      const res = await fetchT(url);
      const body = (await res.json())['subsonic-response'];
      if (body?.status !== 'ok') throw new Error(body?.error?.message || 'no ok');
      const share = body.shares?.share?.[0];
      if (share?.url) {
        console.log(`· share creado (FLAC crudo): ${share.url}`);
        return { id: share.id, url: share.url.replace(/\/+$/, ''), expires: share.expires || null };
      }
    } catch (e) {
      console.warn(`· createShare (${attempt.id ? 'playlist' : 'canciones'}): ${e.message}`);
    }
  }
  return null;
}

async function probeStream(url) {
  try {
    const res = await fetchT(url, { headers: { Range: 'bytes=0-1' } });
    const ct = res.headers.get('content-type') || '';
    return (res.status === 200 || res.status === 206) && /audio|octet-stream|mpeg|ogg|flac/i.test(ct);
  } catch {
    return false;
  }
}

// Los ids de streaming del share son JWTs embebidos en window.__SHARE_INFO__ de su página.
async function shareTracks(shareUrl) {
  const res = await fetchT(shareUrl);
  if (!res.ok) throw new Error(`página del share: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/window\.__SHARE_INFO__\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error('no encontré __SHARE_INFO__ en la página del share');
  return JSON.parse(JSON.parse(m[1])).tracks || [];
}

const isMetaLine = (s) => /^\[[a-z#]+:[^\]]*\]\s*$/i.test((s || '').trim());

function parseLRC(text) {
  const stamp = /\[(\d+):(\d{2}(?:\.\d+)?)\]/g;
  let synced = false;
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(stamp)];
    const content = raw.replace(stamp, '').trim();
    if (!stamps.length) {
      if (content && !isMetaLine(raw)) lines.push({ t: null, text: content });
      continue;
    }
    if (!content || isMetaLine(content)) continue;
    for (const s of stamps) {
      synced = true;
      lines.push({ t: +(Number(s[1]) * 60 + Number(s[2])).toFixed(2), text: content });
    }
  }
  lines.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
  return { synced, lines };
}

const LRCLIB = 'https://lrclib.net/api';
const LRCLIB_UA = 'playlistF (https://github.com/Richard7987/playlistF)';

async function fromLrclib(song) {
  const headers = { 'User-Agent': LRCLIB_UA };
  const dur = Math.round(song.duration || 0);
  await sleep(150);
  try {
    let hit = null;
    const get = await fetchT(`${LRCLIB}/get?${new URLSearchParams({
      artist_name: song.artist || '', track_name: song.title || '',
      album_name: song.album || '', duration: String(dur),
    })}`, { headers });
    if (get.ok) hit = await get.json();
    if (!hit || hit.code === 404) {
      const search = await fetchT(`${LRCLIB}/search?${new URLSearchParams({
        track_name: song.title || '', artist_name: song.artist || '',
      })}`, { headers });
      const arr = search.ok ? await search.json() : [];
      hit = arr
        .filter((x) => x.syncedLyrics || x.plainLyrics)
        .sort((a, b) => Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur))[0] || null;
    }
    if (!hit || hit.instrumental) return null;
    const durOk = Math.abs((hit.duration || 0) - dur) <= 7;
    if (hit.syncedLyrics) return { ...parseLRC(hit.syncedLyrics), source: 'lrclib', durOk };
    const plain = (hit.plainLyrics || '').split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !isMetaLine(t));
    if (plain.length) return { synced: false, source: 'lrclib', lines: plain.map((text) => ({ t: null, text })) };
  } catch { /* red */ }
  return null;
}

async function fromEmbedded(song) {
  try {
    const r = await sub('getLyricsBySongId', { id: song.id });
    const struct = r.lyricsList?.structuredLyrics?.[0];
    if (struct?.line?.length) {
      const synced = struct.synced ?? struct.line.every((l) => l.start != null);
      return {
        synced: !!synced, source: 'embedded',
        lines: struct.line.map((l) => ({
          t: l.start != null ? +(l.start / 1000).toFixed(2) : null,
          text: (l.value || '').trim(),
        })).filter((l) => l.text && !isMetaLine(l.text)),
      };
    }
  } catch { /* fallback */ }
  try {
    const r = await sub('getLyrics', { artist: song.artist || '', title: song.title || '' });
    const raw = (r.lyrics?.value || r.lyrics?.['#text'] || '').trim();
    if (raw) return { ...parseLRC(raw), source: 'embedded' };
  } catch { /* sin letra */ }
  return null;
}

const scoreLyrics = (r) => {
  if (!r || !r.lines.length) return 0;
  if (r.synced) return r.durOk === false ? 2 : 3;
  return 1;
};

async function lyricsFor(song, prefer) {
  if (prefer === 'none') return { synced: false, lines: [], source: 'omitida' };
  const order = prefer === 'embedded' ? [fromEmbedded, fromLrclib] : [fromLrclib, fromEmbedded];
  let best = { synced: false, lines: [], source: null };
  for (const get of order) {
    const r = await get(song).catch(() => null);
    if (scoreLyrics(r) > scoreLyrics(best)) best = r;
    if (scoreLyrics(best) === 3) break;
  }
  return best;
}

async function main() {
  console.log(`▶ playlist "${PLAYLIST_NAME}" desde ${BASE}`);

  const lists = (await sub('getPlaylists')).playlists?.playlist || [];
  const pl = lists.find((p) => p.name?.toLowerCase() === PLAYLIST_NAME.toLowerCase());
  if (!pl) {
    console.error(`✗ No encontré una playlist llamada "${PLAYLIST_NAME}". Disponibles: ${lists.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }

  const entries = (await sub('getPlaylist', { id: pl.id })).playlist?.entry || [];
  if (!entries.length) {
    console.error('✗ La playlist está vacía.');
    process.exit(1);
  }
  console.log(`· ${entries.length} canciones`);

  const songIds = entries.map((e) => e.id);
  const share = await ensureShare(pl.id, songIds);
  if (!share) {
    console.error('✗ No pude crear el share público. Créalo a mano en Navidrome y vuelve a intentar.');
    process.exit(1);
  }
  if (share.expires) {
    const days = Math.round((new Date(share.expires) - Date.now()) / 86400000);
    if (days < 30) console.warn(`⚠ el share caduca en ${days} día(s) (${share.expires}) — renuévalo en Navidrome`);
  }

  let jwts = [];
  try {
    const st = await shareTracks(share.url);
    if (st.length === entries.length) jwts = st.map((t) => t.id);
    else console.warn(`· __SHARE_INFO__ trajo ${st.length} pistas y la playlist tiene ${entries.length}`);
  } catch (e) {
    console.warn(`· ${e.message}`);
  }

  let makeStreamURL = null;
  if (jwts.length && (await probeStream(`${BASE}/share/s/${jwts[0]}`))) {
    makeStreamURL = (i) => `${BASE}/share/s/${jwts[i]}`;
    console.log(`· streaming: ${BASE}/share/s/<token>`);
  } else if (ALLOW_TOKEN) {
    makeStreamURL = (i) => authStreamURL(entries[i].id);
    console.warn('⚠ Uso URL autenticada: el token quedará en playlist.json (repo público).');
  } else {
    console.error('✗ No pude resolver el streaming público del share.');
    console.error('  Reintenta, o usa:  npm run pull -- --allow-token');
    process.exit(1);
  }

  await rm(OUT_COVERS_TMP, { recursive: true, force: true });
  await mkdir(OUT_COVERS_TMP, { recursive: true });
  await mkdir(OUT_DATA, { recursive: true });

  let dedications = {};
  try {
    dedications = JSON.parse(await readFile(resolve(OUT_DATA, 'dedications.json'), 'utf8'));
  } catch { /* aún no existe */ }

  const usedSlugs = new Set();
  const tracks = [];

  for (const [i, e] of entries.entries()) {
    let slug = slugify(`${e.artist || ''}-${e.title || 'track'}`) || `track-${i + 1}`;
    while (usedSlugs.has(slug)) slug += '-x';
    usedSlugs.add(slug);
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${e.artist} — ${e.title}\n`);

    // portada: se re-codifica a WebP 640px (autenticada, queda como archivo en el repo)
    let colors = { bg: '#1b1b21', bgAlt: '#3a2f45', accent: '#e0a35c', text: '#f6f2f5', muted: '#b3a9b3' };
    let cover = null;
    if (e.coverArt) {
      try {
        const res = await fetchT(restURL('getCoverArt', { id: e.coverArt, size: 900 }));
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const webp = await sharp(buf).resize(640, 640, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
          await writeFile(resolve(OUT_COVERS_TMP, `${slug}.webp`), webp);
          cover = `covers/${slug}.webp`;
          colors = await palette(buf);
        }
      } catch (err) {
        console.warn(`     · portada: ${err.message}`);
      }
    }

    const lyrics = await lyricsFor(e, dedications[slug]?.lyricsSource);
    if (!lyrics.lines.length) console.warn('     · sin letra');
    else console.log(`     · letra: ${lyrics.source}${lyrics.synced ? ' (sync)' : ' (texto)'}`);

    tracks.push({
      slug,
      title: e.title || '',
      artist: e.artist || '',
      album: e.album || '',
      duration: e.duration || 0,
      cover,
      streamUrl: makeStreamURL(i),
      colors,
      lyrics,
    });
  }

  const playlist = {
    name: PLAYLIST_NAME,
    generatedAt: new Date().toISOString(),
    navidromeUrl: BASE,
    shareUrl: share.url,
    tracks,
  };
  await writeFile(resolve(OUT_DATA, 'playlist.json'), JSON.stringify(playlist, null, 2) + '\n');
  console.log(`✓ src/data/playlist.json (${tracks.length} canciones)`);

  // swap atómico: si algo falló arriba, las portadas anteriores quedan intactas
  await rm(OUT_COVERS, { recursive: true, force: true });
  await rename(OUT_COVERS_TMP, OUT_COVERS);
  console.log(`✓ public/covers/ (${tracks.filter((t) => t.cover).length} portadas)`);

  // plantilla de dedicatorias — nunca toca dedications.json
  const template = {
    _como_usar: 'Copia a src/data/dedications.json las canciones que quieras. Claves opcionales: dedication, highlightAt ("m:ss"), highlightFrom, highlightTo, fragmentNote, lyricsOffset (segundos: + si la letra va adelantada, - si atrasada), lyricsSource ("lrclib" | "embedded" | "none" para forzar / omitir la letra en el próximo pull).',
  };
  for (const t of tracks) template[t.slug] = { dedication: '', highlightAt: '', lyricsOffset: 0 };
  await writeFile(resolve(OUT_DATA, 'dedications.template.json'), JSON.stringify(template, null, 2) + '\n');
  console.log('✓ src/data/dedications.template.json');

  const slugSet = new Set(tracks.map((t) => t.slug));
  for (const k of Object.keys(dedications)) {
    if (!k.startsWith('_') && !slugSet.has(k)) {
      console.warn(`⚠ dedications.json: "${k}" ya no coincide con ninguna canción de la playlist`);
    }
  }

  if (!existsSync(resolve(OUT_DATA, 'dedications.json'))) {
    await writeFile(resolve(OUT_DATA, 'dedications.json'), '{}\n');
    console.log('✓ src/data/dedications.json (vacío)');
  }

  console.log('\nListo. Revisa, commitea y haz push.');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
