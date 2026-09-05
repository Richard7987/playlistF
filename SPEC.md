# playlistF — SPEC (Fase 1: la idea)

> **Estado:** construido y desplegado. Este documento es la idea original;
> el comportamiento y los comandos actuales están en el `README.md`.

Web estática que muestra la playlist **"Fa"** de Navidrome como una pieza visual:
portada + letra sincronizada en carrusel, colores que salen de cada portada,
y dedicatorias/fragmentos favoritos marcados a mano por canción.

Es un regalo. Tono: vibrante, estilo Apple Music. Escritorio y móvil.

---

## 1. Arquitectura

```
Navidrome (mu.richard69.lat)
   │  share público de la playlist "Fa"  (sin login: stream + portadas + metadatos)
   ▼
scripts/pull.mjs   ← se corre EN LOCAL, a mano, cuando quieras actualizar
   │  escribe:
   │    src/data/playlist.json      (tracks, letras, colores ya extraídos)
   │    public/covers/<n>.jpg       (portadas)
   │    src/data/dedications.template.json   (regenerado: slugs vacíos para rellenar)
   ▼
git commit  (firmado, autor ale_bnes@tuta.com)
   ▼
GitHub Actions (repo público Richard7987/playlistF)
   │  build de Astro — NO toca el servidor, solo compila datos ya commiteados
   ▼
GitHub Pages  → https://richard7987.github.io/playlistF
```

**Por qué así:** el snapshot se genera donde Navidrome es alcanzable (tu máquina) y
se versiona. CI solo compila archivos estáticos. Nada del servidor se expone en el pipeline;
lo único público es el *share* de la playlist "Fa" que tú creas en Navidrome.

**Actualizar la playlist** = correr `nix run .#pull` (o `node scripts/pull.mjs`) y commitear.

---

## 2. Fuentes de datos

| Dato | De dónde | Cuándo |
|---|---|---|
| Tracks (título, artista, álbum, duración) | API del share de Navidrome | build local |
| Portadas | share de Navidrome → `public/covers/` | build local |
| Letra sincronizada (LRC) | embebida en cada canción (ya la tienen) vía `getLyricsBySongId` | build local |
| Paleta de color por track | extraída de la portada con `node-vibrant`/`sharp` en `pull.mjs` | build local |
| URL de streaming por track | endpoint público del share | build local |
| Dedicatorias / fragmentos | **`src/data/dedications.json`, a mano** | tú, cuando quieras |

Si alguna canción no trae LRC sincronizado, se muestra su letra como texto plano sin resaltado por tiempo.

---

## 3. Modelo de datos

### `src/data/playlist.json` (generado, no editar a mano)

```json
{
  "name": "Fa",
  "generatedAt": "2026-09-05T19:00:00Z",
  "navidromeUrl": "https://mu.richard69.lat",
  "shareUrl": "https://mu.richard69.lat/share/AbC123",
  "tracks": [
    {
      "slug": "the-national-i-need-my-girl",
      "title": "I Need My Girl",
      "artist": "The National",
      "album": "Trouble Will Find Me",
      "duration": 245,
      "cover": "covers/the-national-i-need-my-girl.jpg",
      "streamUrl": "https://mu.richard69.lat/share/AbC123/download/07",
      "colors": {
        "bg": "#1b2a3a",
        "bgAlt": "#38506b",
        "accent": "#e8b04b",
        "text": "#f4f6fb",
        "muted": "#b9c4d4"
      },
      "lyrics": {
        "synced": true,
        "lines": [
          { "t": 11.2, "text": "But I won't be no runaway" },
          { "t": 15.8, "text": "'Cause I won't run" }
        ]
      }
    }
  ]
}
```

### `src/data/dedications.json` (lo editas tú)

Diccionario por `slug` de canción. **Todas las claves son opcionales**: pon solo lo que quieras.

```json
{
  "the-national-i-need-my-girl": {
    "dedication": "Esta la ponía en repeat el verano que nos conocimos. Toda tuya.",
    "highlightAt": "2:41"
  },

  "big-thief-paul": {
    "dedication": "El puente entero es sobre nosotros dos, aunque ella no lo sepa.",
    "highlightFrom": "1:58",
    "highlightTo": "2:37",
    "fragmentNote": "esta parte 👆"
  },

  "phoebe-bridgers-scott-street": {
    "highlightAt": "3:12"
  }
}
```

**Cómo se marca el fragmento:**

- `highlightAt: "m:ss"` → resalta **la línea** de la letra que está sonando en ese momento,
  con un estilo distinto al resaltado normal de reproducción.
- `highlightFrom` + `highlightTo` (`"m:ss"` cada uno) → resalta **todas las líneas** dentro de ese rango.
- `dedication` → texto que aparece **debajo** de la letra. Puede ir con o sin `highlight*`.
- `fragmentNote` (opcional) → etiqueta corta que aparece pegada al fragmento resaltado.

Los `slug` disponibles los escupe `pull.mjs` en `src/data/dedications.template.json` cada vez
que corre; copias los que te interesen a `dedications.json`.

---

## 4. Interfaz

### Layout escritorio

```
┌───────────────────────────────────────────────────────────────┐
│  fondo = gradiente animado con los colores de la portada       │
│                                                               │
│   ┌───────────────┐     I Need My Girl · The National   ‹  ›   │
│   │               │                                           │
│   │    PORTADA     │     ……línea anterior (tenue)……            │
│   │   (grande,     │   ▶  línea actual — grande, nítida         │
│   │    glow del    │     ……línea siguiente……                   │
│   │    color)      │     ★  línea del fragmento marcado         │
│   │               │        (color accent, más peso)            │
│   └───────────────┘     ……                                    │
│      ● ● ○ ● ●          (carrusel de letra, autoscroll)        │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐     │
│   │  “Esta la ponía en repeat el verano que…”  (dedic.)  │     │
│   └─────────────────────────────────────────────────────┘     │
│                                                               │
│        [ ▷ reproducir ]     ○──────────── 1:12 / 4:05          │
│                                                               │
│              [  Abrir la playlist en Navidrome  ]              │
│                                                               │
│            hecho con cariño y mucho tiempo libre               │
└───────────────────────────────────────────────────────────────┘
   ‹  ›  y swipe = carrusel ENTRE canciones
```

### Layout móvil

Misma info, apilada: portada arriba → letra en carrusel → dedicatoria → controles
→ botón Navidrome → firma. Swipe horizontal cambia de canción.

### Comportamiento

- **Color dinámico:** el fondo es un gradiente en movimiento lento con `colors.bg`/`bgAlt`,
  acentos en `colors.accent`. Transición suave al cambiar de canción.
- **Letra sincronizada:** `<audio>` con el `streamUrl` del share. En `timeupdate` se marca la
  línea activa (grande, opacidad 1) y las demás se atenúan; la vista hace autoscroll para
  mantener la línea activa centrada ("carrusel" vertical estilo Apple Music).
- **Fragmento marcado:** las líneas de `highlightAt` / `highlightFrom..To` llevan un estilo
  extra permanente (color `accent`, peso, y una barrita lateral). Cuando la reproducción entra
  en esa línea, se combina con el resaltado activo.
- **Carrusel entre canciones:** flechas ‹ › y swipe/drag. Al cambiar, cambia portada, colores,
  letra y dedicatoria. Cambiar de canción pausa/reinicia el audio.
- **Botón descarga/playlist:** enlace directo que abre la playlist "Fa" en Navidrome (el share).
- **Firma:** texto fijo en el pie — *"hecho con cariño y mucho tiempo libre"*.

---

## 5. Stack

- **Astro** (estático). Una isla cliente para el reproductor + sincronía de letra
  (Svelte o TS vanilla — se decide al montar).
- Paleta de color extraída **en build** (`node-vibrant` + `sharp`), no en el cliente → sin parpadeo.
- Animaciones: CSS + Web Animations API; sin librería pesada de por medio.
- `flake.nix` **independiente** (no se engancha a /nixdots): devShell con Node 22 + pnpm.
- Deploy: GitHub Actions (`withastro/action` + `actions/deploy-pages`).
  `astro.config.mjs`: `site: "https://richard7987.github.io"`, `base: "/playlistF"`.

---

## 6. Repo y commits

- GitHub: **`Richard7987/playlistF`**, **público**.
- Commits **firmados** con la clave OpenPGP de la YubiKey
  `91CA 581F 7B78 01E8 8673 D228 DBD5 F61D 8A0A 14D7` (`0xDBD5F61D8A0A14D7`).
- Autor: **`Ale. B <ale_bnes@tuta.com>`** (el correo del login de la YubiKey).
- **Sin** trailer `Co-Authored-By`. Sin `Claude-Session`. Mensajes limpios.
- Nota: cada commit pedirá PIN de la YubiKey + toque (Signature PIN está en "forzado").

---

## 7. Estructura de archivos (al scaffoldear, Fase 3)

```
playlistF/
├── flake.nix
├── README.md                 (minimalista)
├── SPEC.md                    (este archivo)
├── astro.config.mjs
├── package.json
├── .github/workflows/deploy.yml
├── scripts/
│   └── pull.mjs               (snapshot desde el share de Navidrome)
├── public/
│   └── covers/                (portadas, generadas)
└── src/
    ├── data/
    │   ├── playlist.json              (generado)
    │   ├── dedications.json           (a mano)
    │   └── dedications.template.json  (generado, referencia de slugs)
    ├── components/
    │   ├── Player.<isla>
    │   ├── LyricsCarousel.<isla>
    │   └── SongCarousel.<isla>
    ├── lib/
    │   └── time.ts            (parse "m:ss", match de líneas)
    ├── pages/
    │   └── index.astro
    └── styles/
        └── global.css
```

---

## 8. Plan

1. **Fase 1 — idea** ← *estás aquí.* Revisa este SPEC.
2. **Fase 2 — cómo se verá.** Mockup visual (portada + letra en carrusel + línea activa +
   línea de fragmento + dedicatoria + botón + firma), escritorio y móvil, con un ejemplo real
   de dedicatoria para ver cómo queda. Apruebas.
3. **Fase 3 — andamiaje.** Carpeta ya creada; `flake.nix`, Astro, `README.md`, repo en GitHub,
   workflow de Pages. Commit inicial firmado.
4. **Fase 4 — script de datos.** `scripts/pull.mjs`: lee el share, baja portadas, letras,
   extrae paletas, escribe `playlist.json` + template de dedicatorias.
5. **Fase 5 — UI.** Gradiente dinámico, carrusel de canciones, letra sincronizada con
   autoscroll, capa de fragmento/dedicatoria, controles, responsive.
6. **Fase 6 — deploy** y ajuste fino.

### Pendiente de verificar al implementar (Fase 4)

- Endpoints exactos del *share* público de Navidrome para: listar tracks, stream por track,
  portada por track y `getLyricsBySongId`. Puede que haga falta un token del share en la URL.
- Si el share expira: alternativa = usuario invitado read-only solo para el `pull` local
  (nunca en el cliente).
