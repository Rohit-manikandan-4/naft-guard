# Starts the NAFT-GUARD backend AND exposes it publicly via a Cloudflare
# Quick Tunnel. Run from PowerShell: .\start_public.ps1
#
# NOTE: Quick Tunnels get a new random *.trycloudflare.com URL every time
# this script runs. If the frontend is deployed pointing at a previous URL,
# update its VITE_API_BASE env var (in Vercel's dashboard) and redeploy it
# whenever you restart this.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    Write-Host "Backend virtual environment not found — run start.ps1 once first."
    exit 1
}

if (-not $env:AI_MODULE_DIR) { $env:AI_MODULE_DIR = "E:\Arul1\AI_MODULE" }

Write-Host "Starting backend on http://localhost:8000 ..."
Start-Process -NoNewWindow -FilePath ".\venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"

Start-Sleep -Seconds 3

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    $cloudflared = "cloudflared"  # fall back to PATH
}

Write-Host "Starting Cloudflare Tunnel — watch below for your public URL..."
& $cloudflared tunnel --url http://localhost:8000
