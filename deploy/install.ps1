<#
  BeatCam Studio — one-shot installer (Windows / PowerShell)

  Usage (PowerShell, Docker Desktop running):
    iwr -useb https://raw.githubusercontent.com/<USER>/<REPO>/main/deploy/install.ps1 | iex

  Configure via env vars before running:
    $env:EMERGENT_LLM_KEY = "sk-..."
    $env:VPS_UPLOAD_URL   = "https://markyninox.com/muvi/upload.php"   # optional
    $env:VPS_UPLOAD_KEY   = "..."                                     # optional
    $env:REPO_URL         = "https://github.com/<USER>/<REPO>.git"
    $env:APP_DIR          = "beatcam"
#>
$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:REPO_URL) { $env:REPO_URL } else { "https://github.com/USERNAME/beatcam.git" }
$AppDir  = if ($env:APP_DIR)  { $env:APP_DIR }  else { "beatcam" }

function Say($m) { Write-Host "> $m" -ForegroundColor Red }
function Die($m) { Write-Host "x $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command git    -ErrorAction SilentlyContinue)) { Die "git is required." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker Desktop is required." }
try { docker compose version | Out-Null } catch { Die "Docker Compose v2 is required (docker compose)." }

Say "Fetching code from $RepoUrl"
if (Test-Path (Join-Path $AppDir ".git")) {
  git -C $AppDir pull --ff-only
} else {
  git clone $RepoUrl $AppDir
}

Set-Location (Join-Path $AppDir "deploy")

Say "Writing deploy/.env"
@(
  "EMERGENT_LLM_KEY=$($env:EMERGENT_LLM_KEY)"
  "VPS_UPLOAD_URL=$($env:VPS_UPLOAD_URL)"
  "VPS_UPLOAD_KEY=$($env:VPS_UPLOAD_KEY)"
) | Set-Content -Path ".env" -Encoding ascii

if (-not $env:EMERGENT_LLM_KEY) { Say "WARNING: EMERGENT_LLM_KEY is empty - set it in deploy/.env for the AI Coach." }

Say "Building & starting containers"
docker compose up -d --build

Say "Done. Backend is live on :8001"
Write-Host "   Health:  curl http://localhost:8001/api/"
Write-Host "   Gallery: http://localhost:8001/"
