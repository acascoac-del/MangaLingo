# MangaLingo — Backend starter (Windows PowerShell)
# Levanta el backend Python manga-api en http://localhost:8000
# Uso: powershell -ExecutionPolicy Bypass -File scripts\start-manga-api.ps1
#      powershell -ExecutionPolicy Bypass -File scripts\start-manga-api.ps1 -PyVersion 3.12

param(
    [string]$PyVersion = ""   # e.g. "3.12" — si se pasa, usa py -3.12 en vez de python
)

$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API_DIR = Join-Path $PROJECT_DIR "mini-services\manga-api"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MangaLingo API - Backend starter" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- Helper: run a command with timeout, return {ExitCode, StdOut, StdErr} ----------
function Invoke-WithTimeout {
    param(
        [string]$Exe,
        [string[]]$Args,
        [string]$WorkDir,
        [int]$TimeoutSec = 60
    )
    # Use temp files to avoid ProcessStartInfo deadlock with large stderr
    $tmpOut = [System.IO.Path]::GetTempFileName()
    $tmpErr = [System.IO.Path]::GetTempFileName()
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $Exe
        foreach ($a in $Args) { [void]$psi.ArgumentList.Add($a) }
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        if ($WorkDir) { $psi.WorkingDirectory = $WorkDir }

        $p = New-Object System.Diagnostics.Process
        $p.StartInfo = $psi

        # Use event handlers to write output to temp files as it arrives (no deadlock)
        $outBuf = New-Object System.Text.StringBuilder
        $errBuf = New-Object System.Text.StringBuilder
        $outAction = { param($sender, $e) [void]$outBuf.Append($e.Data + "`n") }
        $errAction = { param($sender, $e) [void]$errBuf.Append($e.Data + "`n") }
        Register-ObjectEvent -InputObject $p -EventName OutputDataReceived -Action $outAction | Out-Null
        Register-ObjectEvent -InputObject $p -EventName ErrorDataReceived  -Action $errAction | Out-Null

        [void]$p.Start()
        $p.BeginOutputReadLine()
        $p.BeginErrorReadLine()

        $exited = $p.WaitForExit($TimeoutSec * 1000)
        if (-not $exited) {
            try { $p.Kill() } catch {}
            Write-Host "    TIMEOUT despues de ${TimeoutSec}s" -ForegroundColor Red
            return [pscustomobject]@{ ExitCode = -1; StdOut = $outBuf.ToString(); StdErr = $errBuf.ToString(); TimedOut = $true }
        }
        # Make sure async reads finished
        $p.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $p.ExitCode
            StdOut   = $outBuf.ToString()
            StdErr   = $errBuf.ToString()
            TimedOut = $false
        }
    } finally {
        Remove-Item $tmpOut, $tmpErr -ErrorAction SilentlyContinue
    }
}

# ---------- Detect available Python launcher ----------
Write-Host "[1/6] Detectando Python..." -ForegroundColor Yellow

$pythonExe = ""
$pythonVersionStr = ""

# Try in order: py -3.12, py -3.11, py -3.10, python, python3
$candidates = @()
if ($PyVersion) {
    $candidates += @{ Exe = "py"; Args = @("-$PyVersion", "--version") }
} else {
    $candidates += @{ Exe = "py"; Args = @("-3.12", "--version") }
    $candidates += @{ Exe = "py"; Args = @("-3.11", "--version") }
    $candidates += @{ Exe = "py"; Args = @("-3.10", "--version") }
    $candidates += @{ Exe = "python"; Args = @("--version") }
    $candidates += @{ Exe = "python3"; Args = @("--version") }
}

foreach ($cand in $candidates) {
    $label = "$($cand.Exe) $($cand.Args -join ' ')"
    Write-Host "  Probando: $label ..." -ForegroundColor DarkGray
    $r = Invoke-WithTimeout -Exe $cand.Exe -Args $cand.Args -TimeoutSec 10
    if ($r.TimedOut) {
        Write-Host "    -> TIMEOUT" -ForegroundColor DarkGray
        continue
    }
    if ($r.ExitCode -ne 0) {
        Write-Host "    -> ExitCode $($r.ExitCode)" -ForegroundColor DarkGray
        continue
    }
    $ver = $r.StdOut.Trim()
    if (-not $ver) { $ver = $r.StdErr.Trim() }
    if ($ver -notmatch "Python") {
        # Microsoft Store stub writes "Python was not found" to stderr
        if ($r.StdErr -match "was not found" -or $r.StdErr -match "Microsoft Store") {
            Write-Host "    -> Microsoft Store launcher detectado (no Python real)" -ForegroundColor DarkGray
            continue
        }
        continue
    }
    Write-Host "    -> OK: $ver" -ForegroundColor Green
    $pythonVersionStr = $ver
    # Determine the actual exe to use for venv creation
    if ($cand.Exe -eq "py") {
        # py -3.12 -c "import sys; print(sys.executable)" gives the full path
        $exeResult = Invoke-WithTimeout -Exe "py" -Args @($cand.Args[0], "-c", "import sys; print(sys.executable)") -TimeoutSec 10
        if ($exeResult.ExitCode -eq 0) {
            $pythonExe = $exeResult.StdOut.Trim()
        } else {
            $pythonExe = "py"
        }
        # For venv we need: py -3.12 -m venv .venv
        $pythonExe = "py"
        $pythonVenvArgs = @($cand.Args[0], "-m", "venv")
    } else {
        $pythonExe = $cand.Exe
        $pythonVenvArgs = @("-m", "venv")
    }
    break
}

if (-not $pythonExe) {
    Write-Host ""
    Write-Host "  ERROR: No se encontro Python 3.10/3.11/3.12 en el PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "  SOLUCION:" -ForegroundColor Yellow
    Write-Host "  1. Instala Python 3.12 desde https://www.python.org/downloads/release/python-3120/" -ForegroundColor White
    Write-Host "     (marca 'Add Python to PATH' durante la instalacion)" -ForegroundColor White
    Write-Host "  2. Reinicia PowerShell" -ForegroundColor White
    Write-Host "  3. Verifica con: py -3.12 --version" -ForegroundColor White
    Write-Host "  4. Vuelve a correr este script" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Validate version (reject 3.13+)
if ($pythonVersionStr -match "Python (\d+)\.(\d+)") {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if (($major -eq 3 -and $minor -ge 13) -or $major -gt 3) {
        Write-Host ""
        Write-Host "  ERROR: Python $major.$minor NO es compatible (necesitas 3.10, 3.11 o 3.12)." -ForegroundColor Red
        Write-Host "  Instala Python 3.12 desde https://www.python.org/downloads/release/python-3120/" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Usaremos: $pythonExe ($pythonVersionStr)" -ForegroundColor Green

# ---------- 2. Crear venv ----------
$VENV_DIR = Join-Path $API_DIR ".venv"
$VENV_PYTHON = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_PIP = Join-Path $VENV_DIR "Scripts\pip.exe"

if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host ""
    Write-Host "[2/6] Creando entorno virtual Python (.venv)..." -ForegroundColor Yellow
    Write-Host "  Cmd: $pythonExe $($pythonVenvArgs -join ' ') .venv" -ForegroundColor DarkGray
    $venvResult = Invoke-WithTimeout -Exe $pythonExe -Args ($pythonVenvArgs + @(".venv")) -WorkDir $API_DIR -TimeoutSec 60
    if ($venvResult.ExitCode -ne 0 -or -not (Test-Path $VENV_PYTHON)) {
        Write-Host "  ERROR creando venv:" -ForegroundColor Red
        Write-Host $venvResult.StdErr -ForegroundColor Red
        Write-Host "  Intenta borrar la carpeta .venv manualmente y vuelve a correr:" -ForegroundColor Yellow
        Write-Host "    Remove-Item -Recurse -Force `"$VENV_DIR`"" -ForegroundColor White
        exit 1
    }
    Write-Host "  OK: venv creado" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[2/6] Entorno virtual ya existe." -ForegroundColor Green
}

# ---------- 3. Verificar version del venv ----------
$venvPyResult = Invoke-WithTimeout -Exe $VENV_PYTHON -Args @("--version") -TimeoutSec 10
$venvVersionStr = $venvPyResult.StdOut.Trim()
if (-not $venvVersionStr) { $venvVersionStr = $venvPyResult.StdErr.Trim() }
Write-Host "[3/6] Version del venv: $venvVersionStr" -ForegroundColor Green

if ($venvVersionStr -match "Python (\d+)\.(\d+)") {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if (($major -eq 3 -and $minor -ge 13) -or $major -gt 3) {
        Write-Host ""
        Write-Host "  ERROR: El venv existente usa Python $major.$minor que no es compatible." -ForegroundColor Red
        Write-Host "  Borra el venv y vuelve a correr:" -ForegroundColor Yellow
        Write-Host "    Remove-Item -Recurse -Force `"$VENV_DIR`"" -ForegroundColor White
        exit 1
    }
}

# ---------- 4. Actualizar pip ----------
Write-Host "[4/6] Actualizando pip..." -ForegroundColor Yellow
$upResult = Invoke-WithTimeout -Exe $VENV_PYTHON -Args @("-m", "pip", "install", "--upgrade", "pip") -TimeoutSec 120
if ($upResult.ExitCode -ne 0) {
    Write-Host "  WARN: pip upgrade fallo (continuando de todas formas)" -ForegroundColor Yellow
}
Write-Host "  OK" -ForegroundColor Green

# ---------- 5. Instalar dependencias si falta torch ----------
Write-Host "[5/6] Verificando dependencias..." -ForegroundColor Yellow
$torchCheck = Invoke-WithTimeout -Exe $VENV_PYTHON -Args @("-c", "import torch; print('TORCH_OK')") -TimeoutSec 30
$torchInstalled = ($torchCheck.ExitCode -eq 0 -and $torchCheck.StdOut.Trim() -eq "TORCH_OK")

if (-not $torchInstalled) {
    Write-Host "  torch NO instalado. Instalando dependencias ML (~3 GB, 10-15 min)..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  >>> Paso 1/2: torch + torchvision (CPU wheels, ~200 MB)" -ForegroundColor Cyan
    $r1 = Invoke-WithTimeout -Exe $VENV_PIP -Args @("install", "torch", "torchvision", "--index-url", "https://download.pytorch.org/whl/cpu") -TimeoutSec 600
    Write-Host $r1.StdOut
    if ($r1.ExitCode -ne 0) {
        Write-Host "  ERROR instalando torch:" -ForegroundColor Red
        Write-Host $r1.StdErr -ForegroundColor Red
        Write-Host "  Esto puede ser por firewall/proxy. Prueba manualmente:" -ForegroundColor Yellow
        Write-Host "    & '$VENV_PIP' install torch torchvision --index-url https://download.pytorch.org/whl/cpu" -ForegroundColor White
        exit 1
    }

    Write-Host ""
    Write-Host "  >>> Paso 2/2: resto de dependencias (~2.5 GB, 5-10 min)" -ForegroundColor Cyan
    $deps = @(
        "transformers",
        "huggingface_hub",
        "accelerate",
        "safetensors",
        "sentencepiece",
        "protobuf",
        "timm",
        "kornia",
        "einops",
        "open_clip_torch",
        "ctranslate2",
        "onnxruntime",
        "manga-ocr",
        "omegaconf",
        "pydantic",
        "python-dotenv",
        "colorama",
        "rich",
        "loguru",
        "tqdm",
        "packaging",
        "psutil",
        "py3langid==0.2.2",
        "langdetect",
        "langcodes[data]",
        "opencv-python-headless",
        "pillow",
        "shapely",
        "pyclipper",
        "scikit-image",
        "scipy",
        "freetype-py",
        "ImageHash",
        "python-bidi",
        "arabic-reshaper",
        "regex",
        "editdistance",
        "pyhyphen",
        "requests",
        "httpx==0.27.2",
        "aiohttp",
        "aioshutil",
        "aiofiles",
        "websockets",
        "numpy==1.26.4",
        "pandas",
        "networkx",
        "fastapi",
        "uvicorn[standard]",
        "python-multipart",
        "starlette",
        "marshmallow",
        "deepl",
        "openai==1.63.0",
        "tiktoken",
        "groq",
        "google-genai"
    )
    $okCount = 0
    $failCount = 0
    $failed = @()
    foreach ($dep in $deps) {
        Write-Host "    -> $dep " -ForegroundColor DarkGray -NoNewline
        $r = Invoke-WithTimeout -Exe $VENV_PIP -Args @("install", $dep) -TimeoutSec 300
        if ($r.ExitCode -eq 0) {
            Write-Host "OK" -ForegroundColor Green
            $okCount++
        } else {
            Write-Host "FAIL (continuando)" -ForegroundColor Yellow
            $failCount++
            $failed += $dep
        }
    }
    Write-Host ""
    Write-Host "  Resumen: $okCount OK, $failCount fallidos" -ForegroundColor Cyan
    if ($failed.Count -gt 0) {
        Write-Host "  Paquetes fallidos (algunos son opcionales):" -ForegroundColor DarkGray
        foreach ($f in $failed) { Write-Host "    - $f" -ForegroundColor DarkGray }
    }
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "  OK: torch ya esta instalado" -ForegroundColor Green
}

# ---------- 6. Iniciar el servicio ----------
Write-Host ""
Write-Host "[6/6] Iniciando manga-api en http://localhost:8000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  NOTA: En el primer request, el pipeline descargara ~1.1 GB de pesos de modelos." -ForegroundColor Cyan
Write-Host "  Esto pasa solo la primera vez; despues quedan cacheados." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener el servicio." -ForegroundColor Cyan
Write-Host ""

Set-Location $API_DIR
& $VENV_PYTHON main.py
