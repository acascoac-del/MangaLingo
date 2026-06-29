# MangaLingo — Docker setup script (Windows PowerShell)
#
# Verifica que Docker esté instalado, construye la imagen del backend
# y la lanza con soporte GPU.
#
# Uso:
#   cd D:\chevi\manga-translator-project
#   powershell -ExecutionPolicy Bypass -File scripts\docker-setup.ps1

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Docker setup con GPU" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Verificar Docker ----------
Write-Host "[1/5] Verificando Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker no responde" }
    Write-Host "  OK: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker no esta instalado o no esta corriendo." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "  Durante la instalacion:" -ForegroundColor Yellow
    Write-Host "    1. Marca 'Use WSL 2 instead of Hyper-V'" -ForegroundColor White
    Write-Host "    2. Despues de instalar, abre Docker Desktop" -ForegroundColor White
    Write-Host "    3. Ve a Settings > Resources > GPU y activa NVIDIA GPU" -ForegroundColor White
    Write-Host "    4. Espera a que Docker Desktop diga 'Running' en verde" -ForegroundColor White
    Write-Host ""
    exit 1
}

# ---------- 2. Verificar que Docker GPU está disponible ----------
Write-Host "[2/5] Verificando soporte GPU en Docker..." -ForegroundColor Yellow
$gpuTest = docker run --rm --gpus all nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 nvidia-smi 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK: GPU detectada en Docker" -ForegroundColor Green
    $gpuTest | Select-String "RTX|GeForce|Quadro" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  [WARN] Docker no detecta la GPU." -ForegroundColor Yellow
    Write-Host "  El backend va a correr en CPU (lento)." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Para habilitar GPU en Docker Desktop:" -ForegroundColor Yellow
    Write-Host "    1. Abri Docker Desktop" -ForegroundColor White
    Write-Host "    2. Settings > Resources > GPU" -ForegroundColor White
    Write-Host "    3. Activar 'Enable NVIDIA GPU support'" -ForegroundColor White
    Write-Host "    4. Apply & Restart" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Continuar igualmente en CPU? (s/N)"
    if ($continue -ne "s") { exit 1 }
}

# ---------- 3. Verificar docker-compose.yml ----------
Write-Host "[3/5] Verificando docker-compose.yml..." -ForegroundColor Yellow
$composeFile = Join-Path $PROJECT_DIR "docker-compose.yml"
if (-not (Test-Path $composeFile)) {
    Write-Host "  ERROR: No se encontro docker-compose.yml en $composeFile" -ForegroundColor Red
    Write-Host "  Copia el docker-compose.yml del ZIP a la raiz del proyecto." -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK: docker-compose.yml encontrado" -ForegroundColor Green

# ---------- 4. Verificar Dockerfile ----------
Write-Host "[4/5] Verificando Dockerfile..." -ForegroundColor Yellow
$dockerfile = Join-Path $PROJECT_DIR "mini-services\manga-api\Dockerfile"
if (-not (Test-Path $dockerfile)) {
    Write-Host "  ERROR: No se encontro Dockerfile en $dockerfile" -ForegroundColor Red
    Write-Host "  Copia el Dockerfile del ZIP a mini-services\manga-api\" -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK: Dockerfile encontrado" -ForegroundColor Green

# ---------- 5. Construir y lanzar ----------
Write-Host "[5/5] Construyendo imagen Docker..." -ForegroundColor Yellow
Write-Host "  (Esto tarda 10-20 min la primera vez — descarga ~3 GB de deps)" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PROJECT_DIR
docker compose up --build

# Si llega aquí, el contenedor se detuvo (Ctrl+C o error)
Write-Host ""
Write-Host "Backend detenido." -ForegroundColor Yellow
Write-Host "Para reiniciar: docker compose up" -ForegroundColor DarkGray
Write-Host "Para detener:   docker compose down" -ForegroundColor DarkGray
Write-Host "Para ver logs:   docker compose logs -f" -ForegroundColor DarkGray
