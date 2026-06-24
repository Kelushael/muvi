# BeatCam Studio — PRD

## Original Problem Statement
"An app that allows me to film video while listening to a song to compile the music video."
User detail: Upload MP3s (the beat, with a DAW-style waveform below). Punch in clips Snapchat-style — drag a playhead/scrubber at the top to set song start, toggle record on/off while the music keeps playing (each toggle = a clip placed at that song position). Also import videos from gallery. Built-in filters. Tap each clip; double-tap menu (delete/revert). Compile into one final music video. Must feel like Snapchat/IG/Facebook Stories camera.

## Architecture
- **Frontend:** Expo (SDK 54) + expo-router (stack). expo-camera (record), expo-audio (MP3 playback + scrub), expo-video (preview), expo-document-picker (MP3), expo-image-picker (gallery), react-native-gesture-handler + reanimated (waveform scrub), expo-blur (glass). Dark "BeatCam Studio" design, fonts Barlow Condensed + DM Sans.
- **Backend:** FastAPI + MongoDB (motor) + system FFmpeg/ffprobe. Media stored under `/app/backend/media/{audio,clips,output}`, served via `/api/media/{kind}/{file}`.
- **Compile:** FFmpeg composites each clip onto a black portrait canvas (720x1280, 30fps) at its `song_start` via tpad+overlay enable, with the MP3 as the single audio track; outputs one mp4.

## User Personas
- Music producer / creator who wants to shoot performance/visual clips synced to their own track and export a shareable music video.

## Core Requirements (static)
1. Upload MP3 → project with waveform timeline.
2. Snapchat-style camera with punch-in/out recording over continuous music.
3. Draggable playhead to set/scrub song position.
4. Import clips from gallery.
5. Per-clip select + double-tap menu (delete), global revert (undo last clip).
6. Filters (preview).
7. Compile to one synced music video + share.

## Implemented (2026-06-23)
- [x] Backend: Projects CRUD, clip add/delete (multipart, ffprobe durations), FFmpeg timeline compile, static media serving. 17/17 backend tests pass.
- [x] Projects List: states (loading/empty/error/loaded), card (clips/duration/compiled badge), delete, FAB, create-MP3 modal.
- [x] Camera Studio: full-bleed camera, glass DAW waveform timeline + draggable door playhead (seek), Snapchat record button (punch in/out, music continues), gallery import, filter carousel, clip chips on timeline, tap-select + double-tap delete menu, global revert, permission gate (camera+mic) with Open Settings fallback.
- [x] Preview/Export: auto-compile, expo-video playback, Recompile/Open/Export & Share.

## Known Limitations / Notes
- In-app recording + gallery import are NATIVE only (Expo Go / device), not web preview.
- Filters are preview-only (NOT baked into the compiled output yet).
- YouTube upload and "bounce to VPS" — DEFERRED. Not implemented (YouTube needs OAuth; refused to hardcode VPS root SSH password for security).

## Backlog (prioritized)
- P1: Bake selected filter into compiled output (FFmpeg per-clip filter chain).
- P1: YouTube upload via proper OAuth integration.
- P1: Secure delivery to user's server (SFTP key / signed upload) instead of raw root password.
- P2: Trim & reorder clips; split clip.
- P2: Real PCM waveform from the MP3 (currently synthetic bars).
- P2: Save compiled video to device gallery (expo-media-library).

## Next Tasks
- Confirm device test of record/import flow with the user.
- Then tackle P1 filter-bake + YouTube/secure delivery once credentials/OAuth provided.

## Update (2026-06-24)
- [x] Fixed studio/[id].tsx compile blocker (missing openBpm/saveBpm/rewind fns, dup prop, corrupted trailing styles). App bundles again.
- [x] "Bounce to MUVI" export: backend `POST /api/projects/{id}/export-vps` relays the compiled MP4 to the user's own server (markyninox.com). Endpoint URL+key in backend/.env (VPS_UPLOAD_URL, VPS_UPLOAD_KEY) — key stays server-side, never in app bundle. Preview screen has a "Bounce to MUVI" button.
- [x] MUVI web gallery: `GET /api/gallery` renders a public dark-themed showcase of all compiled videos ("what renders at the web URL").
- [x] Self-host deploy package in /app/deploy/: Dockerfile.backend, docker-compose.yml (backend + mongo + media volume), README.md (run on VPS + point EXPO_PUBLIC_BACKEND_URL at it + Nginx/HTTPS), and upload.php (drop-in relay endpoint matching the backend contract: file field `file`, header `X-Upload-Key`, returns JSON url).
- NOTE: export-vps currently 502s until the user deploys upload.php to markyninox.com and DNS points to 2.25.147.209. Frontend shows a friendly "make sure your endpoint is live" alert on failure.
