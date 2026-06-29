# MangaLingo — Rebrand Script
# Ejecuta esto en la RAIZ del proyecto (D:\chevi\manga-translator-project)
# para rebrandear TODO el backend + frontend + scripts de "Manga Translator"
# a "MangaLingo" y eliminar las referencias user-facing a manga-image-translator.
#
# Uso:
#   cd D:\chevi\manga-translator-project
#   powershell -ExecutionPolicy Bypass -File scripts\rebrand.ps1
#
# NOTAS:
#   - Este script NO toca el codigo dentro de mini-services\manga-api\manga_translator\
#     (ahi quedan los archivos LICENSE y headers de copyright intactos — requisito MIT).
#   - Hace backup automatico de los archivos modificados (.bak) antes de reemplazarlos.
#   - Si corres el script 2 veces, los .bak se preservan (no se sobrescriben).

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Rebrand Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project dir: $PROJECT_DIR" -ForegroundColor DarkGray
Write-Host ""

# ---------- Define replacements ----------
$replacements = @(
    @{ Find = "Manga Translator"; Replace = "MangaLingo" }
    @{ Find = "manga-translator-project"; Replace = "mangalingo-project" }
    @{ Find = "manga-translator-extension"; Replace = "mangalingo-extension" }
    @{ Find = "manga-image-translator"; Replace = "MangaLingo engine" }
    @{ Find = "manga-translator-api"; Replace = "mangalingo-api" }
    @{ Find = '"Manga Translator"'; Replace = '"MangaLingo"' }
)

# ---------- Files to process ----------
# CRITICAL: NO incluimos nada bajo mini-services\manga-api\manga_translator\
$filesToProcess = @(
    "README.md",
    "INSTALL-WINDOWS.md",
    "package.json",
    "mini-services\manga-api\main.py",
    "mini-services\manga-api\pipeline.py",
    "mini-services\manga-api\supervisor.js",
    "mini-services\manga-api\requirements.txt",
    "scripts\watchdog.sh",
    "scripts\watchdog.ps1",
    "scripts\start-manga-api.ps1",
    "scripts\start-frontend.ps1",
    "src\app\layout.tsx",
    "src\app\page.tsx",
    "src\app\api\translate\route.ts",
    "src\app\api\options\route.ts",
    "src\app\api\health\route.ts",
    "src\app\api\extension\assets\route.ts",
    "src\components\manga\navbar.tsx",
    "src\components\manga\hero.tsx",
    "src\components\manga\features.tsx",
    "src\components\manga\pipeline.tsx",
    "src\components\manga\demo-translator.tsx",
    "src\components\manga\download-portal.tsx",
    "src\components\manga\footer.tsx",
    "extension-src\manifest.json",
    "extension-src\background.js",
    "extension-src\popup.html",
    "extension-src\popup.js",
    "extension-src\popup.css",
    "extension-src\content.js",
    "extension-src\content.css",
    "extension-src\options.html",
    "extension-src\options.js",
    "extension-src\README.md"
)

# ---------- Process files ----------
$processed = 0
$skipped = 0
$failed = @()

foreach ($rel in $filesToProcess) {
    $path = Join-Path $PROJECT_DIR $rel
    if (-not (Test-Path $path)) {
        Write-Host "  SKIP (no existe): $rel" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    try {
        $content = [System.IO.File]::ReadAllText($path)
        $original = $content

        foreach ($r in $replacements) {
            $content = $content -replace [regex]::Escape($r.Find), $r.Replace
        }

        if ($content -ne $original) {
            $bak = "$path.bak"
            if (-not (Test-Path $bak)) {
                Copy-Item -Path $path -Destination $bak -Force
            }
            [System.IO.File]::WriteAllText($path, $content)
            Write-Host "  OK: $rel" -ForegroundColor Green
            $processed++
        } else {
            Write-Host "  -  (sin cambios): $rel" -ForegroundColor DarkGray
            $skipped++
        }
    } catch {
        Write-Host "  FAIL: $rel - $($_.Exception.Message)" -ForegroundColor Red
        $failed += $rel
    }
}

# ---------- Rename extension ZIP if present ----------
$extZipOld = Join-Path $PROJECT_DIR "public\manga-translator-extension.zip"
$extZipNew = Join-Path $PROJECT_DIR "public\mangalingo-extension.zip"
if (Test-Path $extZipOld) {
    if (Test-Path $extZipNew) { Remove-Item $extZipNew -Force }
    Move-Item -Path $extZipOld -Destination $extZipNew -Force
    Write-Host ""
    Write-Host "  Renombrado: public\manga-translator-extension.zip -> public\mangalingo-extension.zip" -ForegroundColor Green
}

# ---------- Rename project ZIP if present ----------
$projZipOld = Join-Path $PROJECT_DIR "public\manga-translator-project.zip"
$projZipNew = Join-Path $PROJECT_DIR "public\mangalingo-project.zip"
if (Test-Path $projZipOld) {
    if (Test-Path $projZipNew) { Remove-Item $projZipNew -Force }
    Move-Item -Path $projZipOld -Destination $projZipNew -Force
    Write-Host "  Renombrado: public\manga-translator-project.zip -> public\mangalingo-project.zip" -ForegroundColor Green
}

# ---------- Create ATTRIBUTION.md if missing ----------
$attrPath = Join-Path $PROJECT_DIR "ATTRIBUTION.md"
if (-not (Test-Path $attrPath)) {
    $attrContent = @"
# Attribution & Third-Party Notices

This product (MangaLingo) includes software developed by third parties under
various open-source licenses. The following notices acknowledge those
contributions.

## manga-image-translator

- **Project**: https://github.com/zyddnys/manga-image-translator
- **License**: MIT License
- **Copyright**: (c) zyddnys and contributors
- **Use**: MangaLingo uses the detection, OCR, inpainting, translation, and
  rendering modules from manga-image-translator as the underlying engine for
  its translation pipeline. These modules are located under
  `mini-services/manga-api/manga_translator/` and retain their original
  license and copyright notices.

The MIT License requires that the copyright notice and permission notice be
included in all copies or substantial portions of the software. The original
license file is preserved at
`mini-services/manga-api/manga_translator/manga_translator.py` (header) and
the upstream repository LICENSE file.

## manga-ocr

- **Project**: https://github.com/kha-white/manga-ocr
- **License**: Apache License 2.0
- **Copyright**: (c) kha-white
- **Use**: Optical character recognition specialized for Japanese manga text.
- **Model**: `kha-white/manga-ocr-base` on Hugging Face.

## LaMa (Large Mask Inpainting)

- **Project**: https://github.com/advimman/lama
- **License**: Apache License 2.0
- **Use**: Image inpainting to erase original text from manga panels.

## Comic Text Detector (CTD)

- **Project**: https://github.com/dmMaze/comic-text-detector
- **License**: Apache License 2.0
- **Use**: Text and bubble detection in comic/manga images.

## M2M100

- **Project**: https://huggingface.co/facebook/m2m100_418M
- **License**: MIT License
- **Copyright**: (c) Facebook, Inc. and its affiliates.
- **Use**: Many-to-many translation model used as the default offline
  translator for non-API-key workflows.

## PyTorch

- **Project**: https://pytorch.org/
- **License**: BSD-style license
- **Copyright**: (c) Facebook, Inc. and its affiliates
- **Use**: Tensor computation and deep learning framework.

## Transformers (Hugging Face)

- **Project**: https://github.com/huggingface/transformers
- **License**: Apache License 2.0
- **Use**: Model loading and inference for OCR and translation models.

## OpenCV

- **Project**: https://opencv.org/
- **License**: Apache License 2.0
- **Use**: Image processing operations.

## Pillow

- **Project**: https://python-pillow.org/
- **License**: HPND License
- **Use**: Image manipulation and text rendering.

## FastAPI

- **Project**: https://fastapi.tiangolo.com/
- **License**: MIT License
- **Use**: HTTP API server framework.

## Next.js

- **Project**: https://nextjs.org/
- **License**: MIT License
- **Copyright**: (c) Vercel, Inc.
- **Use**: Frontend web framework for the demo and download portal.

## shadcn/ui

- **Project**: https://ui.shadcn.com/
- **License**: MIT License
- **Use**: React UI components used in the web frontend.

## Tailwind CSS

- **Project**: https://tailwindcss.com/
- **License**: MIT License
- **Use**: Utility-first CSS framework.

## Tesseract OCR

- **Project**: https://github.com/tesseract-ocr/tesseract
- **License**: Apache License 2.0
- **Use**: Optional lightweight OCR fallback (not used in the default
  pipeline, which uses manga-ocr).

## deep-translator

- **Project**: https://github.com/nidhaloff/deep-translator
- **License**: MIT License
- **Use**: Optional translation library for free online translators.

---

## License Summary

MangaLingo's own source code (everything outside of
`mini-services/manga-api/manga_translator/` and excluding third-party Python
packages installed via pip) is provided under the MIT License.

The `manga_translator/` directory contains code from manga-image-translator,
which is also MIT-licensed, and retains its original copyright notice.

For any questions about licensing or attribution, contact the project
maintainer.
"@
    [System.IO.File]::WriteAllText($attrPath, $attrContent)
    Write-Host ""
    Write-Host "  Creado: ATTRIBUTION.md (creditos de terceros)" -ForegroundColor Green
}

# ---------- Summary ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Resumen del rebrand" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Archivos modificados:  $processed" -ForegroundColor Green
Write-Host "  Archivos sin cambios:  $skipped" -ForegroundColor DarkGray
if ($failed.Count -gt 0) {
    Write-Host "  Archivos fallidos:     $($failed.Count)" -ForegroundColor Red
    foreach ($f in $failed) { Write-Host "    - $f" -ForegroundColor Red }
}
Write-Host ""
Write-Host "  NOTAS:" -ForegroundColor Yellow
Write-Host "  - Los archivos dentro de mini-services\manga-api\manga_translator\ NO fueron modificados"
Write-Host "    (preserva licencia MIT intacta - requisito legal)"
Write-Host "  - Backups (.bak) creados para cada archivo modificado"
Write-Host "  - ATTRIBUTION.md creado en la raiz con creditos de terceros"
Write-Host ""
Write-Host "  PROXIMOS PASOS:" -ForegroundColor Yellow
Write-Host "  1. Recargar la extension en chrome://extensions (boton Recargar)"
Write-Host "  2. Reiniciar el backend Python (Ctrl+C en su terminal y volver a lanzar)"
Write-Host "  3. Reiniciar el frontend Next.js (Ctrl+C en su terminal y volver a lanzar)"
Write-Host "  4. Probar la demo en http://localhost:3000"
Write-Host ""
