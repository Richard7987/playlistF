# Fa

Una playlist, hecha web. Portada, letra sincronizada y dedicatorias.

→ https://richard7987.github.io/playlistF

## Actualizar la playlist

```sh
cp .env.example .env          # rellenar credenciales de Navidrome
nix develop                   # o tener Node 22 a mano
npm install
npm run pull                  # baja canciones, portadas y letras de "Fa"
git add -A && git commit -m "datos: actualizar snapshot"
git push
```

El deploy lo hace GitHub Actions al hacer push a `main`. CI nunca contacta al servidor:
solo compila el snapshot ya commiteado.

## Dedicatorias

A mano en `src/data/dedications.json`. Cada clave es el `slug` de una canción; los slugs
disponibles quedan en `src/data/dedications.template.json` tras cada `npm run pull`.
Todas las claves son opcionales.

```json
{
  "the-national-i-need-my-girl": {
    "dedication": "texto que aparece bajo la letra",
    "highlightAt": "2:41"
  },
  "big-thief-paul": {
    "dedication": "…",
    "highlightFrom": "1:58",
    "highlightTo": "2:37",
    "fragmentNote": "etiqueta corta junto al fragmento"
  }
}
```

`highlightAt` resalta la línea que suena en ese minuto. `highlightFrom`/`highlightTo`
resaltan un rango. Formato `m:ss`.

## Desarrollo

```sh
npm run dev
```
