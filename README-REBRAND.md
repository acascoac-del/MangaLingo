# MangaLingo — Rebrand Patch

Este ZIP contiene todo lo necesario para rebrandear tu proyecto de
"Manga Translator" a "MangaLingo" (o el nombre que prefieras).

## Qué incluye

- `scripts/rebrand.ps1` — Script PowerShell que rebrandea todos los archivos
  del backend, frontend y scripts. Hace backup automático (.bak) de cada
  archivo modificado.
- `extension-src/` — La extensión Chrome YA rebrandeada (v1.0.3). Copiala
  sobre tu `extension-src/` existente.
- `ATTRIBUTION.md` — Creditos de terceros (manga-image-translator, manga-ocr,
  LaMa, etc.). Va en la raiz del proyecto.

## Cómo aplicar

### 1. Reemplazar la extensión Chrome (ya rebrandeada)

Copia la carpeta `extension-src/` de este ZIP sobre tu
`D:\chevi\manga-translator-project\extension-src\` existente.

En Chrome → `chrome://extensions` → click en **Recargar**.

### 2. Ejecutar el script de rebrand para el resto

```powershell
cd D:\chevi\manga-translator-project
powershell -ExecutionPolicy Bypass -File scripts\rebrand.ps1
```

Esto va a:
- Rebrandear todos los archivos del backend Python (`mini-services/manga-api/`)
- Rebrandear todos los componentes del frontend Next.js (`src/`)
- Rebrandear los scripts PowerShell (`scripts/`)
- Rebrandear los READMEs y el package.json
- Renombrar los ZIPs en `public/`
- Crear `ATTRIBUTION.md` en la raiz

**NO toca** la carpeta `mini-services/manga-api/manga_translator/` —
esa queda intacta porque contiene el código MIT-licensed de
manga-image-translator (requisito legal).

### 3. Reiniciar los servicios

- Backend Python: `Ctrl+C` en su terminal y volver a lanzar
  `.\.venv\Scripts\python.exe main.py`
- Frontend Next.js: `Ctrl+C` en su terminal y volver a lanzar
  `bun run dev`

### 4. Verificar

- Abrí http://localhost:3000 — debería decir "MangaLingo" en el navbar y hero
- Click derecho sobre una imagen → "Traducir manga" — debería funcionar igual
- http://localhost:8000/health — el campo `engine` ahora dice "MangaLingo engine"

## Si queres otro nombre

Si no te gusta "MangaLingo" y querés otro nombre (ej: "MangoTrad", "KanaLingo",
"YomuTranslator", etc.) editá el script `rebrand.ps1` y cambiá las líneas:

```powershell
$replacements = @(
    @{ Find = "Manga Translator"; Replace = "MangaLingo" }   # <- cambiá MangaLingo
    ...
)
```

Reemplazá todas las apariciones de "MangaLingo" por el nombre que quieras.
Después ejecutá el script de nuevo.

## Rollback

Si algo se rompe y querés volver atrás, los archivos `.bak` están al lado
de cada archivo modificado. Para restaurarlos:

```powershell
Get-ChildItem -Recurse -Filter "*.bak" | ForEach-Object {
    Move-Item -Path $_.FullName -Destination ($_.FullName -replace '\.bak$', '') -Force
}
```
