# MangaLingo — Docker full setup script (Windows PowerShell)
#
# Levanta backend + frontend en Docker con un solo comando.
#
# Uso:
#   cd D:\chevi\manga-translator-project
#   powershell -ExecutionPolicy Bypass -File scripts\docker-full-setup.ps1

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Docker full setup (backend + frontend)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Verificar Docker ----------
Write-Host "[1/4] Verificando Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker no responde" }
    Write-Host "  OK: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker no esta instalado o no esta corriendo." -ForegroundColor Red
    Write-Host "  Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

# ---------- 2. Verificar GPU ----------
Write-Host "[2/4] Verificando soporte GPU..." -ForegroundColor Yellow
$gpuTest = docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK: GPU detectada en Docker" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Docker no detecta GPU. Backend correra en CPU (lento)." -ForegroundColor Yellow
}

# ---------- 3. Verificar archivos necesarios ----------
Write-Host "[3/4] Verificando archivos..." -ForegroundColor Yellow

$files = @(
    "docker-compose.yml",
    "frontend\Dockerfile",
    "frontend\.dockerignore",
    "mini-services\manga-api\Dockerfile",
    "mini-services\manga-api\patch_optional_imports.py",
    "next.config.ts"
)

foreach ($f in $files) {
    $fullPath = Join-Path $PROJECT_DIR $f
    if (-not (Test-Path $fullPath)) {
        Write-Host "  ERROR: Falta $f" -ForegroundColor Red
        Write-Host "  Copia los archivos del ZIP de docker-full-setup al proyecto." -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "  OK: todos los archivos presentes" -ForegroundColor Green

# ---------- 4. Construir y lanzar ----------
Write-Host "[4/4] Construyendo y lanzando contenedores..." -ForegroundColor Yellow
Write-Host "  (Primera vez: 20-30 min — descarga imagenes CUDA + instala deps)" -ForegroundColor DarkGray
Write-Host "  (Siguientes veces: 30 segundos)" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PROJECT_DIR

# Detener contenedores previos
docker compose down 2>&1 | Out-Null

# Construir y lanzar
docker compose up --build

# Si llega aquí, se detuvo (Ctrl+C)
Write-Host ""
Write-Host "Contenedores detenidos." -ForegroundColor Yellow
Write-Host "Para reiniciar: docker compose up" -ForegroundColor DarkGray
Write-Host "Para detener:   docker compose down" -ForegroundColor DarkGray
