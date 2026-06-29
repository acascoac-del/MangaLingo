# MangaLingo — benchmark.ps1
#
# Mide cuánto tarda el backend en traducir una imagen de prueba.
# Útil para comparar antes/después de aplicar las optimizaciones de GPU.
#
# Uso:
#   cd D:\chevi\manga-translator-project
#   powershell -ExecutionPolicy Bypass -File scripts\benchmark.ps1

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API_DIR = Join-Path $PROJECT_DIR "mini-services\manga-api"
$VENV_PYTHON = Join-Path $API_DIR ".venv\Scripts\python.exe"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Benchmark de velocidad" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el backend esté corriendo
Write-Host "[1/3] Verificando backend..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing
    $health = $r.Content | ConvertFrom-Json
    Write-Host "  OK: backend vivo (engine: $($health.engine))" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: backend no responde en http://localhost:8000" -ForegroundColor Red
    Write-Host "  Lanzá el backend primero:" -ForegroundColor Yellow
    Write-Host "    cd D:\chevi\manga-translator-project\mini-services\manga-api" -ForegroundColor DarkGray
    Write-Host "    .\.venv\Scripts\python.exe main.py" -ForegroundColor DarkGray
    exit 1
}

# Generar imagen de prueba si no existe
$testImg = Join-Path $API_DIR "test_manga_jp.png"
if (-not (Test-Path $testImg)) {
    Write-Host "[2/3] Generando imagen de prueba..." -ForegroundColor Yellow
    & $VENV_PYTHON (Join-Path $PROJECT_DIR "scripts\make_manga_test.py") 2>&1 | Out-Null
    if (-not (Test-Path $testImg)) {
        Write-Host "  ERROR: no se pudo generar la imagen de prueba." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[2/3] Imagen de prueba ya existe." -ForegroundColor Green
}

# Leer la imagen y convertir a base64
$imgBytes = [System.IO.File]::ReadAllBytes($testImg)
$imgB64 = [System.Convert]::ToBase64String($imgBytes)
Write-Host "  Imagen: $testImg ($(($imgBytes.Length / 1KB).ToString('F0')) KB)" -ForegroundColor DarkGray

# Hacer 3 requests y medir el tiempo
Write-Host ""
Write-Host "[3/3] Traduciendo 3 veces (la 1ra carga modelos, las otras miden)..." -ForegroundColor Yellow

$body = @{
    image = $imgB64
    target_lang = "es"
    source_lang = "auto"
    detector = "ctd"
    ocr = "manga_ocr"
    translator = "google"
    inpainter = "lama"
    renderer = "manga2eng"
    font_family = "comic"
    font_size = 0
    return_metadata = $false
} | ConvertTo-Json

$times = @()
for ($i = 1; $i -le 3; $i++) {
    Write-Host "  Run $i/3..." -ForegroundColor DarkGray -NoNewline
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8000/translate/json" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 300 -UseBasicParsing
        $sw.Stop()
        $data = $resp.Content | ConvertFrom-Json
        if ($data.success) {
            $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
            $times += $sw.Elapsed.TotalSeconds
            $cacheHit = if ($data.cache_hit) { " (CACHE HIT)" } else { "" }
            Write-Host " OK - ${secs}s$cacheHit" -ForegroundColor Green
        } else {
            Write-Host " FAIL: $($data.error)" -ForegroundColor Red
        }
    } catch {
        $sw.Stop()
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Resumen
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Resultados" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
if ($times.Count -gt 0) {
    Write-Host "  Tiempos: $($times | ForEach-Object { [math]::Round($_, 1).ToString() + 's' } | Join-String -Separator ', ')"
    if ($times.Count -gt 1) {
        # Promedio excluyendo el primero (carga de modelos)
        $warm = $times[1..($times.Count - 1)]
        $avg = ($warm | Measure-Object -Average).Average
        Write-Host "  Promedio (sin carga inicial): $([math]::Round($avg, 1))s por imagen" -ForegroundColor Green
        $rate = 1 / $avg
        Write-Host "  Tasa: $($rate.ToString('F2')) imagenes/segundo" -ForegroundColor Green
        $eta29 = 29 * $avg
        Write-Host "  Para 29 imagenes (capitulo tipico): ~$([math]::Round($eta29 / 60, 1)) min" -ForegroundColor Green
    } else {
        Write-Host "  Solo 1 run (incluye carga de modelos): $([math]::Round($times[0], 1))s" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No se completaron runs exitosos." -ForegroundColor Red
}
Write-Host ""
