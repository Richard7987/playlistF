#!/usr/bin/env node
// Reordena la playlist "Fa" EN NAVIDROME según scripts/order.txt (los listados van primero).
//   npm run reorder -- --dry   # solo muestra los movimientos
//   npm run reorder            # los aplica

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASS, PLAYLIST_NAME = 'Fa' } = process.env;
const DRY = process.argv.includes('--dry');

if (!NAVIDROME_URL || !NAVIDROME_USER || !NAVIDROME_PASS) {
  console.error('✗ Falta .env (NAVIDROME_URL / NAVIDROME_USER / NAVIDROME_PASS).');
  process.exit(1);
}
const BASE = NAVIDROME_URL.replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchT = (u, o = {}) => fetch(u, { ...o, signal: AbortSignal.timeout(20000) });
const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function login() {
  const res = await fetchT(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: NAVIDROME_USER, password: NAVIDROME_PASS }),
  });
  if (!res.ok) throw new Error(`auth/login: HTTP ${res.status}`);
  const b = await res.json();
  if (!b.token) throw new Error('auth/login sin token');
  return { 'x-nd-authorization': `Bearer ${b.token}`, 'x-nd-client-unique-id': 'playlistF-reorder', 'content-type': 'application/json' };
}

async function api(headers, method, path, body) {
  const res = await fetchT(`${BASE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 140)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const wanted = (await readFile(resolve(ROOT, 'scripts/order.txt'), 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const headers = await login();

  const lists = await api(headers, 'GET', '/playlist?_start=0&_end=500');
  const arr = Array.isArray(lists) ? lists : lists?.data || [];
  const pl = arr.find((p) => p.name?.toLowerCase() === PLAYLIST_NAME.toLowerCase());
  if (!pl) {
    console.error(`✗ No encontré la playlist "${PLAYLIST_NAME}". Hay: ${arr.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }

  const tracks = await api(headers, 'GET', `/playlist/${pl.id}/tracks?_start=0&_end=1000`);
  const cur = (Array.isArray(tracks) ? tracks : tracks?.data || []).map((t) => ({
    key: String(t.mediaFileId ?? t.id),
    label: `${t.artist || t.albumArtist || '?'} — ${t.title || '?'}`,
    hay: norm(`${t.artist || ''} ${t.albumArtist || ''} ${t.title || ''}`),
  }));
  if (!cur.length) {
    console.error('✗ La playlist no devolvió pistas. Primer objeto:', JSON.stringify(tracks)?.slice(0, 300));
    process.exit(1);
  }
  console.log(`· "${PLAYLIST_NAME}" tiene ${cur.length} pistas`);

  const front = [];
  const used = new Set();
  for (const w of wanted) {
    const q = norm(w.replace(/—|-/g, ' '));
    const words = q.split(' ').filter(Boolean);
    const found = cur.find((t) => !used.has(t.key) && words.every((x) => t.hay.includes(x)));
    if (found) {
      front.push(found.key);
      used.add(found.key);
    } else {
      console.warn(`  ⚠ sin coincidencia: "${w}"`);
    }
  }
  const desired = [...front, ...cur.filter((t) => !used.has(t.key)).map((t) => t.key)];

  const working = cur.map((t) => t.key);
  const labelOf = (k) => cur.find((t) => t.key === k)?.label || k;
  let moves = 0;
  for (let i = 1; i <= desired.length; i++) {
    const target = desired[i - 1];
    const from = working.indexOf(target) + 1;
    if (from === i || from === 0) continue;
    moves++;
    console.log(`  ${String(i).padStart(2)} ← pos ${from}  ${labelOf(target)}`);
    if (!DRY) {
      await api(headers, 'PUT', `/playlist/${pl.id}/tracks/${from}`, { insert_before: String(i) });
      await sleep(120);
    }
    const [x] = working.splice(from - 1, 1);
    working.splice(i - 1, 0, x);
  }

  if (DRY) {
    console.log(`\n(dry) ${moves} movimiento(s). Corre sin --dry para aplicarlos.`);
    return;
  }

  const after = await api(headers, 'GET', `/playlist/${pl.id}/tracks?_start=0&_end=1000`);
  const list = (Array.isArray(after) ? after : after?.data || []).map(
    (t, i) => `${String(i + 1).padStart(2)}. ${t.artist || '?'} — ${t.title || '?'}`,
  );
  console.log(`\n✓ ${moves} movimiento(s). Orden nuevo:\n${list.slice(0, 30).join('\n')}\n...`);
  console.log('\nAhora: npm run pull');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
