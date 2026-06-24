# Self-host BeatCam Studio on your VPS (markyninox.com / 2.25.147.209)

Run the exact same backend that powers the app, on your own always-on server.
The mobile app just points its `EXPO_PUBLIC_BACKEND_URL` at your VPS.

---

## A. Run the backend with Docker (recommended)

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

Once the backend is live, visiting **https://markyninox.com/api/gallery**
renders a public showcase of every compiled music video. Map your root domain
to it in Nginx if you want `markyninox.com` itself to show the gallery.

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
