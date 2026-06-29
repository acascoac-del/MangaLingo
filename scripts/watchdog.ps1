# MangaLingo — Watchdog PowerShell
# Verifica cada 15s si manga-api responde; si se cayó (OOM o crash), lo revive.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API_DIR = Join-Path $PROJECT_DIR "mini-services\manga-api"
$PYTHON = Join-Path $API_DIR ".venv\Scripts\python.exe"
$MAIN = Join-Path $API_DIR "main.py"
$LOG_FILE = Join-Path $env:TEMP "manga-watchdog.log"

function Log-Message {
    param([string]$msg)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

Log-Message "Watchdog started. API dir: $API_DIR"
Log-Message "Python: $PYTHON"
Log-Message "Log file: $LOG_FILE"

while ($true) {
    $up = $false
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $up = $true }
    } catch {
        $up = $false
    }

    if (-not $up) {
        Log-Message "manga-api down - restarting..."

        # Kill any leftover python processes for our main.py
        Get-Process python -ErrorAction SilentlyContinue | Where-Object {
            try {
                $_.Path -and ($_.Path -like "*manga-api*")
            } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue

        Start-Sleep -Seconds 2

        # Start fresh
        if (Test-Path $PYTHON) {
            Start-Process -FilePath $PYTHON -ArgumentList $MAIN -WorkingDirectory $API_DIR -WindowStyle Hidden
        } else {
            Log-Message "Python not found at $PYTHON - skipping restart"
        }

        # Wait up to 60s for it to come up
        for ($i = 1; $i -le 60; $i++) {
            Start-Sleep -Seconds 1
            try {
                Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null
                Log-Message "manga-api back up after ${i}s"
                break
            } catch {
                if ($i % 10 -eq 0) {
                    Log-Message "  ... still waiting (${i}s)"
                }
            }
        }
    }

    Start-Sleep -Seconds 15
}
