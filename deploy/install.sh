#!/usr/bin/env bash
# BeatCam Studio — one-shot installer (Linux / macOS)
#
# Usage (on your VPS):
#   curl -fsSL https://raw.githubusercontent.com/<USER>/<REPO>/main/deploy/install.sh | bash
#
# Configure via env vars before running (recommended for piped installs):
#   EMERGENT_LLM_KEY=sk-...                 # your LLM key (or Emergent universal key)
#   VPS_UPLOAD_URL=https://markyninox.com/muvi/upload.php   # optional
#   VPS_UPLOAD_KEY=...                                       # optional
#   REPO_URL=https://github.com/<USER>/<REPO>.git           # your repo
#   APP_DIR=beatcam                                          # clone target dir
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/USERNAME/beatcam.git}"
APP_DIR="${APP_DIR:-beatcam}"

say() { printf "\033[1;31m▶ %s\033[0m\n" "$1"; }
die() { printf "\033[1;31m✖ %s\033[0m\n" "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required. Install it and re-run."
command -v docker >/dev/null 2>&1 || die "Docker is required. See https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose)."

say "Fetching code from $REPO_URL"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/deploy"

say "Writing deploy/.env"
{
  echo "EMERGENT_LLM_KEY=${EMERGENT_LLM_KEY:-}"
  echo "VPS_UPLOAD_URL=${VPS_UPLOAD_URL:-}"
  echo "VPS_UPLOAD_KEY=${VPS_UPLOAD_KEY:-}"
} > .env

[ -z "${EMERGENT_LLM_KEY:-}" ] && say "WARNING: EMERGENT_LLM_KEY is empty — the AI Coach will not work until you set it in deploy/.env"

say "Building & starting containers"
docker compose up -d --build

say "Done. Backend is live on :8001"
echo "   Health:  curl http://localhost:8001/api/"
echo "   Gallery: http://localhost:8001/   (point markyninox.com here via your reverse proxy)"
