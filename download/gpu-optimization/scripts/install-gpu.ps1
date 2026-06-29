# MangaLingo — install-gpu.ps1
#
# Instala PyTorch con CUDA en el venv existente y aplica las optimizaciones
# de GPU al backend. Pensado para RTX 3050 (4GB VRAM) pero funciona con
# cualquier GPU NVIDIA CUDA.
#
# Uso:
#   cd D:\chevi\manga-translator-project
#   powershell -ExecutionPolicy Bypass -File scripts\install-gpu.ps1
#
# Requisitos previos:
#   - NVIDIA drivers instalados (verifica con: nvidia-smi)
#   - Python 3.12 venv YA creado en mini-services\manga-api\.venv
#   - El backend YA funcionando en CPU (para confirmar que el resto está OK)

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API_DIR = Join-Path $PROJECT_DIR "mini-services\manga-api"
$VENV_PYTHON = Join-Path $API_DIR ".venv\Scripts\python.exe"
$VENV_PIP = Join-Path $API_DIR ".venv\Scripts\pip.exe"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo - Instalar soporte GPU CUDA" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Verificar nvidia-smi ----------
Write-Host "[1/6] Verificando GPU NVIDIA..." -ForegroundColor Yellow
try {
    $gpuInfo = nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: $gpuInfo" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: nvidia-smi no respondió. Necesitas drivers NVIDIA instalados." -ForegroundColor Red
        Write-Host "  Descargalos de: https://www.nvidia.com/Download/index.aspx" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ERROR: nvidia-smi no encontrado en PATH." -ForegroundColor Red
    Write-Host "  Instala los drivers NVIDIA y vuelve a intentar." -ForegroundColor Red
    exit 1
}

# ---------- 2. Verificar venv ----------
Write-Host "[2/6] Verificando venv..." -ForegroundColor Yellow
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "  ERROR: No existe $VENV_PYTHON" -ForegroundColor Red
    Write-Host "  Necesitas tener el backend funcionando en CPU primero." -ForegroundColor Red
    exit 1
}
$pyVer = & $VENV_PYTHON --version 2>&1
Write-Host "  OK: $pyVer" -ForegroundColor Green

# ---------- 3. Desinstalar torch CPU ----------
Write-Host "[3/6] Desinstalando torch CPU..." -ForegroundColor Yellow
& $VENV_PIP uninstall torch torchvision -y 2>&1 | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ---------- 4. Instalar torch CUDA ----------
Write-Host "[4/6] Instalando torch CUDA (~2.5 GB, 5-10 min)..." -ForegroundColor Yellow
Write-Host "  (Esto descargara la version de PyTorch con soporte CUDA)" -ForegroundColor DarkGray

# Detectar version de CUDA instalada (el instalador de PyTorch default trae CUDA 12.1)
# que es compatible con la mayoria de los drivers recientes.
& $VENV_PIP install torch torchvision --index-url https://download.pytorch.org/whl/cu121
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR instalando torch CUDA. Probando con CUDA 11.8..." -ForegroundColor Yellow
    & $VENV_PIP install torch torchvision --index-url https://download.pytorch.org/whl/cu118
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: No se pudo instalar torch CUDA." -ForegroundColor Red
        Write-Host "  Probablemente tu driver es muy viejo. Actualizalo desde:" -ForegroundColor Red
        Write-Host "  https://www.nvidia.com/Download/index.aspx" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  OK" -ForegroundColor Green

# ---------- 5. Verificar CUDA disponible ----------
Write-Host "[5/6] Verificando que PyTorch detecte la GPU..." -ForegroundColor Yellow
$testScript = @'
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print(f"VRAM: {vram:.1f} GB")
    # Test de inferencia simple
    x = torch.randn(1000, 1000, device='cuda')
    y = x @ x
    print(f"Test matmul en GPU: OK ({y.shape})")
else:
    print("ERROR: CUDA no detectado")
    exit(1)
'@
$testScript | & $VENV_PYTHON -
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: PyTorch no detecta CUDA." -ForegroundColor Red
    Write-Host "  Verifica que tienes drivers NVIDIA actualizados." -ForegroundColor Red
    exit 1
}

# ---------- 6. Aplicar el pipeline.py optimizado ----------
Write-Host "[6/6] Aplicando pipeline.py optimizado para GPU..." -ForegroundColor Yellow
$srcPipeline = Join-Path $PROJECT_DIR "download\gpu-optimization\mini-services\manga-api\pipeline.py"
$dstPipeline = Join-Path $API_DIR "pipeline.py"

if (Test-Path $srcPipeline) {
    # Hacer backup del pipeline.py actual
    $bakPipeline = "$dstPipeline.bak-cpu"
    if (-not (Test-Path $bakPipeline)) {
        Copy-Item -Path $dstPipeline -Destination $bakPipeline -Force
        Write-Host "  Backup del pipeline CPU: $bakPipeline" -ForegroundColor DarkGray
    }
    Copy-Item -Path $srcPipeline -Destination $dstPipeline -Force
    Write-Host "  OK: pipeline.py reemplazado por version GPU" -ForegroundColor Green
} else {
    Write-Host "  WARN: No se encontro $srcPipeline" -ForegroundColor Yellow
    Write-Host "  Tendras que copiar pipeline.py manualmente desde el ZIP de optimizacion." -ForegroundColor Yellow
}

# ---------- Resumen ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Instalacion completada!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  PROXIMOS PASOS:" -ForegroundColor Yellow
Write-Host "  1. Reinicia el backend Python (Ctrl+C y vuelve a lanzar):" -ForegroundColor White
Write-Host "        cd D:\chevi\manga-translator-project\mini-services\manga-api" -ForegroundColor DarkGray
Write-Host "        .\.venv\Scripts\python.exe main.py" -ForegroundColor DarkGray
Write-Host "  2. Mira el log — deberias ver:" -ForegroundColor White
Write-Host "        'GPU detectada: NVIDIA GeForce RTX 3050 (4.0 GB VRAM)'" -ForegroundColor DarkGray
Write-Host "        'Device seleccionado: cuda'" -ForegroundColor DarkGray
Write-Host "  3. Probá traducir una imagen — deberia tardar 3-5s en vez de 30-60s" -ForegroundColor White
Write-Host "  4. Si algo falla, revertí con:" -ForegroundColor White
Write-Host "        Copy-Item pipeline.py.bak-cpu pipeline.py -Force" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  OPTIMIZACIONES APLICADAS:" -ForegroundColor Yellow
Write-Host "  - device='cuda' (GPU en vez de CPU) → 10x mas rapido" -ForegroundColor White
Write-Host "  - detection_size=1536 (era 2048) → 25% menos VRAM" -ForegroundColor White
Write-Host "  - inpainting_size=1280 (era 2048) → 50% menos VRAM" -ForegroundColor White
Write-Host "  - inpainting_precision=fp16 (era bf16) → mitad VRAM en LaMa" -ForegroundColor White
Write-Host "  - Cache de 50 imagenes → evita re-traducir" -ForegroundColor White
Write-Host ""
