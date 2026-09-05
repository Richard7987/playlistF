# Fa

Una playlist, hecha web. Portada, letra sincronizada, colores de la carátula y
dedicatorias. Astro estático en GitHub Pages; instalable y con caché offline (PWA).

→ https://richard7987.github.io/playlistF

## Actualizar la playlist

```sh
cp .env.example .env          # credenciales de Navidrome
nix develop                   # o tener Node 22 a mano
npm install
npm run pull                  # snapshot de "Fa": canciones, portadas (WebP), letras
git add -A && git commit -m "datos: actualizar snapshot"
git push
```

`pull` corre en local: crea/reutiliza un *share* público de la playlist, baja los
metadatos, re-codifica las portadas y elige la mejor letra (LRCLIB con verificación
de duración, si no la embebida en Navidrome). El deploy lo hace GitHub Actions al
hacer push a `main`; CI **nunca** contacta al servidor.

## Dedicatorias

A mano en `src/data/dedications.json`, o con el editor visual: `npm run dev` →
`/playlistF/editor` (audio + clic en la letra para marcar tiempos; suelta el JSON listo).

Cada clave es el `slug` de una canción (los disponibles quedan en
`dedications.template.json` tras cada `pull`). Todas las claves son opcionales:

```json
{
  "the-national-i-need-my-girl": {
    "dedication": "texto que aparece bajo la letra",
    "highlightAt": "2:41"
  },
  "big-thief-paul": {
    "highlightFrom": "1:58",
    "highlightTo": "2:37",
    "fragmentNote": "etiqueta corta junto al fragmento"
  }
}
```

- `highlightAt` (`m:ss`) resalta la línea de ese minuto; `highlightFrom`/`highlightTo`, un rango.
- `lyricsOffset` — segundos sumados a cada tiempo si la letra va desfasada (+ adelantada, − atrasada).
- `lyricsSource` — `"lrclib"` | `"embedded"` | `"none"` para forzar u omitir la letra en el próximo `pull`.

## Teclado

`espacio`/`k` play · `←`/`→` cambiar canción · `j`/`l` ±10 s · `↑`/`↓` volumen · `m` mute · `Esc` cierra la playlist

## Desarrollo

```sh
npm run dev      # servidor local
npm run check    # astro check + tipos
npm test         # unit (vitest)
npm run test:e2e # smoke (playwright; en NixOS: nix-shell -p playwright-driver.browsers)
```
