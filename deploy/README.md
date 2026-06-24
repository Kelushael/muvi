# Self-host BeatCam Studio on your VPS (markyninox.com / 2.25.147.209)

Run the exact same backend that powers the app, on your own always-on server.
The mobile app just points its `EXPO_PUBLIC_BACKEND_URL` at your VPS.

---

## 0. Get the code on GitHub first

In Emergent, click **Save to GitHub** (top of the workspace) to push this repo to
your account (requires a paid plan). Then edit the install scripts' default
`REPO_URL` (or pass it as an env var) to point at your repo.

## Quick install (one-liner)

**Linux / macOS** (on the VPS, Docker installed):
```bash
EMERGENT_LLM_KEY=sk-... \
REPO_URL=https://github.com/<USER>/<REPO>.git \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/<USER>/<REPO>/main/deploy/install.sh)"
```

**Windows (PowerShell)** with Docker Desktop:
```powershell
$env:EMERGENT_LLM_KEY="sk-..."; $env:REPO_URL="https://github.com/<USER>/<REPO>.git"
iwr -useb https://raw.githubusercontent.com/<USER>/<REPO>/main/deploy/install.ps1 | iex
```

Both scripts: check Docker/git → clone (or pull) your repo → write `deploy/.env`
→ `docker compose up -d --build`. Backend ends up live on `:8001`.

---

## A. Manual run with Docker (if you prefer)

On the VPS (Docker + docker compose installed):

```bash
git clone <your-repo> beatcam && cd beatcam/deploy

# set your keys
export EMERGENT_LLM_KEY=sk-emergent-xxxxxxxx        # or your own LLM key
export VPS_UPLOAD_URL=https://markyninox.com/muvi/upload.php   # optional
export VPS_UPLOAD_KEY=R5ErW04y8tE5WWJKRgU7FOTRnUjNmfyBaMP5FEZ517d2b243  # optional

docker compose up -d --build
```

Backend now listens on `:8001`. MongoDB + compiled media persist in Docker volumes.

### Put it behind HTTPS (markyninox.com)
Point an Nginx/Caddy reverse proxy at `127.0.0.1:8001`:

```nginx
server {
    server_name markyninox.com;
    client_max_body_size 600M;          # allow big video uploads
    location /api/ { proxy_pass http://127.0.0.1:8001; }
    location /     { proxy_pass http://127.0.0.1:8001; }  # serves /api/gallery etc.
}
```
Then `certbot --nginx -d markyninox.com` for SSL.

---

## B. Point the app at your VPS

In `frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://markyninox.com
```
Rebuild the app (Emergent Publish → build). Every API call now hits your server.

---

## C. The MUVI web gallery

Once the backend is live, **markyninox.com itself** (the root) renders a public
showcase of every compiled music video — the backend serves the gallery at `/`
(and also at `/api/gallery`). No extra Nginx remap needed; just proxy `/` to the
backend as shown above.

---

## D. (Optional) "Bounce to MUVI" relay — `upload.php`

If you keep the Emergent-hosted backend but want finished videos copied to your
web space, drop `upload.php` (in this folder) at `https://markyninox.com/muvi/upload.php`.
Contract it implements:
- `POST` multipart, file field **`file`**
- header **`X-Upload-Key: <key>`**
- returns `{"ok":true,"url":"https://markyninox.com/muvi/<file>.mp4"}`

The backend env vars `VPS_UPLOAD_URL` / `VPS_UPLOAD_KEY` must match.
Make sure the `/muvi/` folder is writable by the web server.
