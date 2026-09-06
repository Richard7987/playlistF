# Fa

Una playlist, hecha web. Astro estático en GitHub Pages.

## Actualizar

```sh
cp .env.example .env    # credenciales de Navidrome
npm install
npm run pull            # snapshot de "Fa": canciones, portadas, letras
git commit -am "datos: snapshot" && git push
```

`pull` corre en local; el deploy lo hace CI al hacer push a `main`.

## Dedicatorias

A mano en `src/data/dedications.json` (o `npm run dev` → `/editor`). Clave = `slug`
de la canción; todas las claves opcionales:

- `dedication` — texto bajo la letra
- `highlightAt` (`m:ss`) — resalta esa línea; `highlightFrom`/`highlightTo` un rango
- `fragmentNote` — etiqueta junto al fragmento
- `lyricsOffset` — segundos si la letra va desfasada (+ adelantada, − atrasada)
- `lyricsSource` — `"lrclib"` | `"embedded"` | `"none"` para el próximo `pull`

## Comandos

```sh
npm run dev      npm run check      npm test
```
