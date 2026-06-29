# MangaLingo — Frontend starter (Windows PowerShell)
# Levanta el frontend Next.js en http://localhost:3000
# Uso: powershell -ExecutionPolicy Bypass -File scripts\start-frontend.ps1

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Frontend starter" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar bun
Write-Host "[1/3] Verificando Bun..." -ForegroundColor Yellow
try {
    $bunVersion = bun --version 2>&1
    Write-Host "  OK: bun $bunVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Bun no está instalado." -ForegroundColor Red
    Write-Host "  Instálalo con: npm install -g bun" -ForegroundColor Red
    exit 1
}

# Instalar dependencias
Write-Host "[2/3] Instalando dependencias (bun install)..." -ForegroundColor Yellow
Set-Location $PROJECT_DIR
bun install
Write-Host "  OK" -ForegroundColor Green

# Iniciar
Write-Host "[3/3] Iniciando Next.js en http://localhost:3000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener." -ForegroundColor Cyan
Write-Host ""

bun run dev
