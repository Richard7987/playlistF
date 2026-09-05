#!/usr/bin/env node
// Snapshot de la playlist "Fa" desde Navidrome → archivos estáticos que se commitean.
// Corre EN LOCAL (necesita .env con credenciales). CI nunca ejecuta esto.
//
//   npm run pull            # genera src/data/playlist.json + public/covers/*
//   npm run pull -- --allow-token   # permite el fallback autenticado (mete un token en el JSON)

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vibrant } from 'node-vibrant/node';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DATA = resolve(ROOT, 'src/data');
const OUT_COVERS = resolve(ROOT, 'public/covers');

const {
  NAVIDROME_URL,
  NAVIDROME_USER,
  NAVIDROME_PASS,
  PLAYLIST_NAME = 'Fa',
} = process.env;

const ALLOW_TOKEN = process.argv.includes('--allow-token');

if (!NAVIDROME_URL || !NAVIDROME_USER || !NAVIDROME_PASS) {
  console.error('✗ Falta configuración. Copia .env.example a .env y rellena NAVIDROME_URL / NAVIDROME_USER / NAVIDROME_PASS.');
  process.exit(1);
}

const BASE = NAVIDROME_URL.replace(/\/+$/, '');
const API_VERSION = '1.16.1';
const CLIENT = 'playlistF';

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
  const res = await fetch(restURL(method, params));
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

const hexToRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const clampDark = (hex, max) => (luminance(hex) > max ? mix(hex, '#000000', 0.55) : hex);
const clampLight = (hex, min) => (luminance(hex) < min ? mix(hex, '#ffffff', 0.5) : hex);

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
  const bg = clampDark(pick('DarkMuted', 'DarkVibrant', 'Muted') || '#1b1b21', 0.14);
  const bgAlt = clampDark(pick('DarkVibrant', 'Vibrant', 'Muted') || '#3a2f45', 0.30);
  const accent = clampLight(clampDark(pick('Vibrant', 'LightVibrant', 'LightMuted') || '#e0a35c', 0.62), 0.34);
  const text = mix(pick('LightMuted', 'LightVibrant') || '#ffffff', '#ffffff', 0.6);
  const muted = mix(text, bg, 0.42);
  return { bg, bgAlt, accent, text, muted };
}

async function ensureShare(playlistId, songIds) {
  const tag = `playlistF:${PLAYLIST_NAME}`;
  try {
    const r = await sub('getShares');
    const found = (r.shares?.share || []).find((s) => s.description === tag);
    if (found?.url) {
      console.log(`· share reutilizado: ${found.url}`);
      return { id: found.id, url: found.url.replace(/\/+$/, '') };
    }
  } catch (e) {
    console.warn(`· getShares: ${e.message}`);
  }
  for (const attempt of [{ id: playlistId }, ...(songIds.length ? [{ ids: songIds }] : [])]) {
    try {
      const params = attempt.id ? { id: attempt.id, description: tag } : { description: tag };
      const url = new URL(restURL('createShare', params));
      if (attempt.ids) for (const id of attempt.ids) url.searchParams.append('id', id);
      const res = await fetch(url);
      const body = (await res.json())['subsonic-response'];
      if (body?.status !== 'ok') throw new Error(body?.error?.message || 'no ok');
      const share = body.shares?.share?.[0];
      if (share?.url) {
        console.log(`· share creado: ${share.url}`);
        return { id: share.id, url: share.url.replace(/\/+$/, '') };
      }
    } catch (e) {
      console.warn(`· createShare (${attempt.id ? 'playlist' : 'canciones'}): ${e.message}`);
    }
  }
  return null;
}

async function probeStream(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
    const ct = res.headers.get('content-type') || '';
    return (res.status === 200 || res.status === 206) && /audio|octet-stream|mpeg|ogg|flac/i.test(ct);
  } catch {
    return false;
  }
}

// Los ids de streaming del share son JWTs embebidos en window.__SHARE_INFO__ de su página.
async function shareTracks(shareUrl) {
  const res = await fetch(shareUrl);
  if (!res.ok) throw new Error(`página del share: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/window\.__SHARE_INFO__\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error('no encontré __SHARE_INFO__ en la página del share');
  return JSON.parse(JSON.parse(m[1])).tracks || [];
}

async function lyricsFor(song) {
  try {
    const r = await sub('getLyricsBySongId', { id: song.id });
    const struct = r.lyricsList?.structuredLyrics?.[0];
    if (struct?.line?.length) {
      const synced = struct.synced ?? struct.line.every((l) => l.start != null);
      return {
        synced: !!synced,
        lines: struct.line.map((l) => ({
          t: l.start != null ? +(l.start / 1000).toFixed(2) : null,
          text: (l.value || '').trim(),
        })).filter((l) => l.text),
      };
    }
  } catch { /* fallback */ }
  try {
    const r = await sub('getLyrics', { artist: song.artist || '', title: song.title || '' });
    const raw = (r.lyrics?.value || r.lyrics?.['#text'] || '').trim();
    if (raw) {
      return { synced: false, lines: raw.split('\n').map((t) => ({ t: null, text: t.trim() })).filter((l) => l.text) };
    }
  } catch { /* sin letra */ }
  return { synced: false, lines: [] };
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

  await rm(OUT_COVERS, { recursive: true, force: true });
  await mkdir(OUT_COVERS, { recursive: true });
  await mkdir(OUT_DATA, { recursive: true });

  const usedSlugs = new Set();
  const tracks = [];

  for (const [i, e] of entries.entries()) {
    let slug = slugify(`${e.artist || ''}-${e.title || 'track'}`) || `track-${i + 1}`;
    while (usedSlugs.has(slug)) slug += '-x';
    usedSlugs.add(slug);
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${e.artist} — ${e.title}\n`);

    // portada (autenticada, se guarda como archivo)
    let colors = { bg: '#1b1b21', bgAlt: '#3a2f45', accent: '#e0a35c', text: '#f6f2f5', muted: '#b3a9b3' };
    let cover = null;
    if (e.coverArt) {
      try {
        const res = await fetch(restURL('getCoverArt', { id: e.coverArt, size: 900 }));
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(resolve(OUT_COVERS, `${slug}.jpg`), buf);
          cover = `covers/${slug}.jpg`;
          colors = await palette(buf);
        }
      } catch (err) {
        console.warn(`     · portada: ${err.message}`);
      }
    }

    const lyrics = await lyricsFor(e);
    if (!lyrics.lines.length) console.warn('     · sin letra');
    else if (!lyrics.synced) console.warn('     · letra sin sincronizar');

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

  // plantilla de dedicatorias — nunca toca dedications.json
  const template = {
    _como_usar: 'Copia a src/data/dedications.json las canciones que quieras. Claves opcionales: dedication, highlightAt ("m:ss"), highlightFrom, highlightTo, fragmentNote.',
  };
  for (const t of tracks) template[t.slug] = { dedication: '', highlightAt: '' };
  await writeFile(resolve(OUT_DATA, 'dedications.template.json'), JSON.stringify(template, null, 2) + '\n');
  console.log('✓ src/data/dedications.template.json');

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
