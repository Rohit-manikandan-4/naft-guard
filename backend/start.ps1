# Starts the NAFT-GUARD backend API (FastAPI + the NEFT-GUARD AI module).
# Run from PowerShell:  .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    Write-Host "Creating virtual environment..."
    py -m venv venv
    .\venv\Scripts\python.exe -m pip install --upgrade pip
    .\venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    .\venv\Scripts\python.exe -m pip install -r requirements.txt
}

# Point this at your AI_MODULE folder if it isn't at E:\AI_MODULE
if (-not $env:AI_MODULE_DIR) { $env:AI_MODULE_DIR = "E:\AI_MODULE" }

.\venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
