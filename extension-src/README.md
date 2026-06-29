# MangaLingo — Extensión Chrome (Manifest V3) v1.1.0

## Novedades v1.1.0

- 🎨 **Rediseño completo del popup**: hero con gradiente, status chip animado, tabs con iconos, dropzone mejorado, botones con sombras y animaciones
- 🌐 **Selector de idioma destino** (22 idiomas): español, inglés, francés, alemán, italiano, portugués, ruso, japonés, coreano, chino (simpl+trad), árabe, holandés, polaco, turco, indonesio, vietnamita, tailandés, hindi, checo, rumano, ucraniano, húngaro
- 🌐 **Selector de idioma origen** con auto-detección
- 🎨 **Selector de estilo de letra**: Comic Shanns, Anime Ace, Anime Ace 3, Microsoft YaHei (CJK), MS Gothic (CJK), Arial Unicode
- 📚 **Botón "Traducir todas las imágenes"** en el popup, en una pestaña nueva con barra de progreso en vivo
- ⌨️ **Atajo nuevo**: `Ctrl+Shift+A` para traducir todas las imágenes de la página
- 🚦 **Status chip en vivo**: indica si el backend está listo (verde), caído (rojo) o verificando (amarillo)
- 🔧 **Opciones avanzadas colapsables** en la pestaña Ajustes (detector, OCR, traductor, inpainter)
- 📦 **Iconos nuevos** con gradiente fuchsia→ámbar, estilo glassmorphism

## Instalación

1. Descomprime este ZIP en una carpeta permanente.
2. Chrome → `chrome://extensions` → activar **Modo desarrollador**.
3. **Cargar descomprimida** → selecciona la carpeta.
4. ¡Listo! Click derecho sobre cualquier imagen → **🌍 Traducir esta imagen con MangaLingo**.

## Conexión a Hugging Face Spaces ☁️

Si tienes el servidor de MangaLingo alojado en Hugging Face (por ejemplo, en `https://acsaco-manga-translator.hf.space`), puedes conectarte a él directamente:
1. Pulsa el ícono de la extensión MangaLingo.
2. Ve a la pestaña **Ajustes** ⚙️.
3. Cambia la **API base** a la URL de tu espacio (ej. `https://acsaco-manga-translator.hf.space`).
4. La extensión ahora procesará las imágenes usando tu servidor en la nube sin necesidad de tener nada encendido en tu PC.

## Uso

| Acción | Cómo |
|--------|-----|
| Traducir una imagen | Click derecho → **🌍 Traducir esta imagen** / o pestaña "Traducir" del popup |
| Traducir TODAS las imágenes grandes | Click derecho → **📚 Traducir todas** / pestaña "Página" / `Ctrl+Shift+A` |
| Atajo imagen bajo cursor | `Ctrl+Shift+M` |
| Cambiar idioma destino | Popup → pestaña "Ajustes" → Idioma destino |

## Pestañas del popup

### 🌐 Traducir
- Drag & drop o selección de archivo
- URL input para cargar imagen remota
- Preview antes/después
- Tabla de regiones con texto original → traducción
- Botón descargar PNG

### 📚 Página
- Botón "Traducir todas las imágenes" → dispara traducción de todas las imágenes >= 200x200 px de la pestaña activa
- Barra de progreso con conteo (X / Y)
- Status en vivo ("Traduciendo imagen 3 de 12…")
- Confirmación si hay más de 25 imágenes
- Tips con atajos de teclado

### ⚙️ Ajustes
- **Idiomas**: destino (22 idiomas) y origen (auto-detectar)
- **Renderizado**: fuente tipográfica (6 opciones) y renderer
- **Pipeline avanzado** (colapsable): detector, OCR, traductor, inpainter
- **Conexión**: URL de la API base

## Archivos

```
extension/
├── manifest.json       # Manifest V3, v1.1.0
├── background.js       # Service worker (contextMenus, atajos, fetch, keepalive)
├── content.js          # Inyectado en páginas; traduce imágenes
├── content.css         # Overlays
├── popup.html / .js / .css
├── options.html / .js
└── icons/              # 16/32/48/128 px (gradient glassmorphism)
```

## Avisos de terceros

MangaLingo utiliza software open source licenciado bajo MIT y otras licencias
permisivas. Ver `ATTRIBUTION.md` en la raíz del proyecto para créditos completos.
