from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import shutil
import subprocess
import json
import asyncio
import httpx
import imageio_ffmpeg
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Storage directories
MEDIA_DIR = ROOT_DIR / "media"
AUDIO_DIR = MEDIA_DIR / "audio"
CLIP_DIR = MEDIA_DIR / "clips"
OUTPUT_DIR = MEDIA_DIR / "output"
for d in (AUDIO_DIR, CLIP_DIR, OUTPUT_DIR):
    d.mkdir(parents=True, exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------------------- Helpers ----------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Per-clip visual effects, baked into the compiled output via ffmpeg.
FILTER_FX = {
    "none": "",
    "warm": "eq=gamma_r=1.08:gamma_b=0.92:saturation=1.1",
    "vivid": "eq=saturation=1.5:contrast=1.08",
    "noir": "hue=s=0,eq=contrast=1.2",
    "vcr": "noise=alls=16:allf=t,eq=saturation=1.35:contrast=1.05,unsharp=5:5:1.0",
    "trippy": "hue=H=2*PI*t:s=1.5",
    "negative": "negate",
    "photoneg": "negate,hue=s=0",
}


def media_duration(path: Path) -> float:
    """Return media duration in seconds by parsing ffmpeg output (0.0 on failure)."""
    try:
        out = subprocess.run(
            [FFMPEG, "-i", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", out.stderr)
        if m:
            h, mn, s = m.groups()
            return int(h) * 3600 + int(mn) * 60 + float(s)
    except Exception as e:
        logger.warning(f"duration probe failed for {path}: {e}")
    return 0.0


def public_url(kind: str, filename: str) -> str:
    return f"/api/media/{kind}/{filename}"


def clean_project(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------------------------- Models ----------------------------
class Clip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    url: str
    song_start: float = 0.0      # position in the song (seconds) where clip is placed
    duration: float = 0.0        # clip length in seconds (recorded)
    trim_start: float = 0.0      # trim in-point (seconds within clip)
    trim_end: float = 0.0        # trim out-point (0 = use full duration)
    source: str = "camera"       # camera | gallery
    filter: str = "none"
    created_at: str = Field(default_factory=now_iso)


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    audio_filename: str
    audio_url: str
    audio_duration: float = 0.0
    bpm: float = 0.0
    snap: bool = True
    clips: List[Clip] = []
    output_url: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------------------------- Routes ----------------------------
@api_router.get("/")
async def root():
    return {"message": "BeatCam Studio API"}


@api_router.get("/projects", response_model=List[Project])
async def list_projects():
    docs = await db.projects.find().sort("updated_at", -1).to_list(200)
    return [Project(**clean_project(d)) for d in docs]


@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    return Project(**clean_project(doc))


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    bpm: Optional[float] = None
    snap: Optional[bool] = None


@api_router.patch("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectUpdate):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    sets = {}
    if body.title is not None:
        sets["title"] = body.title
    if body.bpm is not None:
        sets["bpm"] = max(body.bpm, 0.0)
    if body.snap is not None:
        sets["snap"] = body.snap
    if sets:
        sets["updated_at"] = now_iso()
        sets["output_url"] = None
        await db.projects.update_one({"id": project_id}, {"$set": sets})
        doc = await db.projects.find_one({"id": project_id})
    return Project(**clean_project(doc))


@api_router.post("/projects", response_model=Project)
async def create_project(title: str = Form(...), audio: UploadFile = File(...)):
    ext = Path(audio.filename or "track.mp3").suffix or ".mp3"
    filename = f"{uuid.uuid4()}{ext}"
    dest = AUDIO_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(audio.file, f)
    duration = media_duration(dest)
    project = Project(
        title=title or "Untitled",
        audio_filename=filename,
        audio_url=public_url("audio", filename),
        audio_duration=duration,
    )
    await db.projects.insert_one(project.dict())
    return project


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    await db.projects.delete_one({"id": project_id})
    return {"ok": True}


@api_router.post("/projects/{project_id}/clips", response_model=Project)
async def add_clip(
    project_id: str,
    song_start: float = Form(0.0),
    source: str = Form("camera"),
    filter: str = Form("none"),
    video: UploadFile = File(...),
):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")

    ext = Path(video.filename or "clip.mp4").suffix or ".mp4"
    filename = f"{uuid.uuid4()}{ext}"
    dest = CLIP_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(video.file, f)
    duration = media_duration(dest)

    # Clips are crammed back-to-back: each new clip starts right where the
    # previous one ended (cumulative effective duration). No gaps.
    def _eff(c):
        full = c.get("duration", 0) or 0
        t0 = c.get("trim_start", 0) or 0
        t1 = c.get("trim_end", 0) or 0
        t1 = t1 if (t1 and t1 > 0) else full
        return max(t1 - t0, 0)

    cumulative = sum(_eff(c) for c in doc.get("clips", []))

    clip = Clip(
        filename=filename,
        url=public_url("clips", filename),
        song_start=cumulative,
        duration=duration,
        source=source,
        filter=filter,
    )
    await db.projects.update_one(
        {"id": project_id},
        {"$push": {"clips": clip.dict()},
         "$set": {"updated_at": now_iso(), "output_url": None}},
    )
    doc = await db.projects.find_one({"id": project_id})
    return Project(**clean_project(doc))


@api_router.delete("/projects/{project_id}/clips/{clip_id}", response_model=Project)
async def delete_clip(project_id: str, clip_id: str):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    for c in doc.get("clips", []):
        if c["id"] == clip_id:
            fp = CLIP_DIR / c["filename"]
            if fp.exists():
                try:
                    fp.unlink()
                except Exception:
                    pass
    await db.projects.update_one(
        {"id": project_id},
        {"$pull": {"clips": {"id": clip_id}},
         "$set": {"updated_at": now_iso(), "output_url": None}},
    )
    doc = await db.projects.find_one({"id": project_id})
    return Project(**clean_project(doc))


class ClipUpdate(BaseModel):
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    song_start: Optional[float] = None


@api_router.patch("/projects/{project_id}/clips/{clip_id}", response_model=Project)
async def update_clip(project_id: str, clip_id: str, body: ClipUpdate):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    sets = {}
    if body.trim_start is not None:
        sets["clips.$[c].trim_start"] = max(body.trim_start, 0.0)
    if body.trim_end is not None:
        sets["clips.$[c].trim_end"] = max(body.trim_end, 0.0)
    if body.song_start is not None:
        sets["clips.$[c].song_start"] = max(body.song_start, 0.0)
    if sets:
        sets["updated_at"] = now_iso()
        sets["output_url"] = None
        await db.projects.update_one(
            {"id": project_id}, {"$set": sets},
            array_filters=[{"c.id": clip_id}],
        )
        doc = await db.projects.find_one({"id": project_id})
    return Project(**clean_project(doc))


@api_router.post("/projects/{project_id}/compile", response_model=Project)
async def compile_project(project_id: str):
    doc = await db.projects.find_one({"id": project_id})
    if not doc:
        raise HTTPException(404, "Project not found")
    project = Project(**clean_project(doc))
    if not project.clips:
        raise HTTPException(400, "No clips to compile")

    audio_path = AUDIO_DIR / project.audio_filename
    total = project.audio_duration
    if total <= 0:
        total = media_duration(audio_path)
        if total > 0:
            await db.projects.update_one(
                {"id": project_id}, {"$set": {"audio_duration": total}})
    total = max(total, 0.5)

    clips = sorted(project.clips, key=lambda c: c.created_at)

    W, H, FPS = 720, 1280, 30
    inputs = []
    for c in clips:
        inputs += ["-i", str(CLIP_DIR / c.filename)]

    segs = []
    labels = []
    for idx, c in enumerate(clips):
        full = c.duration if c.duration > 0 else (media_duration(CLIP_DIR / c.filename) or 2.0)
        ts = max(c.trim_start, 0.0)
        te = c.trim_end if (c.trim_end and c.trim_end > 0) else full
        te = min(te, full)
        if te <= ts:
            ts, te = 0.0, full
        te = min(te, ts + 10.0)  # enforce 10s max per clip
        # Snap the cut to the nearest beat (BPM grid) so edits land on the downbeat.
        if project.bpm and project.bpm > 0 and project.snap:
            beat = 60.0 / project.bpm
            eff = te - ts
            snapped = round(eff / beat) * beat
            if snapped < beat:
                snapped = beat
            te = ts + min(snapped, full - ts, 10.0)
            if te <= ts:
                te = min(ts + beat, full)
        fx = FILTER_FX.get(c.filter, "")
        chain = (
            f"[{idx}:v]trim=start={ts:.3f}:end={te:.3f},setpts=PTS-STARTPTS,"
            f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},setsar=1,fps={FPS},format=yuv420p"
        )
        if fx:
            chain += "," + fx
        chain += f"[v{idx}]"
        segs.append(chain)
        labels.append(f"[v{idx}]")

    concat = "".join(labels) + f"concat=n={len(clips)}:v=1:a=0[vout]"
    filter_complex = ";".join(segs + [concat])
    out_name = f"{project.id}.mp4"
    out_path = OUTPUT_DIR / out_name

    # Video = clips crammed back-to-back (no gaps); audio = the song from 0,
    # trimmed to the video length via -shortest.
    cmd = [FFMPEG, "-y", *inputs, "-i", str(audio_path),
           "-filter_complex", filter_complex,
           "-map", "[vout]", "-map", f"{len(clips)}:a",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k",
           "-shortest", "-movflags", "+faststart", str(out_path)]

    logger.info("Compiling project %s with %d clips", project.id, len(clips))
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=240)
        if proc.returncode != 0:
            logger.error("ffmpeg error: %s", stderr.decode()[-1500:])
            raise HTTPException(500, "Compilation failed")
    except asyncio.TimeoutError:
        raise HTTPException(500, "Compilation timed out")

    output_url = public_url("output", out_name)
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"output_url": output_url, "updated_at": now_iso()}},
    )
    project.output_url = output_url
    return project


@api_router.get("/media/{kind}/{filename}")
async def serve_media(kind: str, filename: str):
    folder = {"audio": AUDIO_DIR, "clips": CLIP_DIR, "output": OUTPUT_DIR}.get(kind)
    if not folder:
        raise HTTPException(404, "Not found")
    fp = folder / filename
    if not fp.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(fp))


SYSTEM_PROMPT = """You are BeatCam Coach, the built-in AI guide inside BeatCam Studio — a mobile app for filming music videos to an uploaded song and bouncing them out.

HOW THE APP WORKS (so you can guide users precisely):
- A project = one uploaded MP3/audio track. A DAW-style waveform timeline shows the song; a draggable playhead ("door") scrubs it.
- Filming: a transport bar has Rewind, Play/Pause, Record, and Export. The song plays continuously. Tapping Record (after a 3-2-1 countdown) punches IN a clip; tapping again punches OUT — the music keeps playing. Clips are capped at 10 seconds each.
- Clips cram together back-to-back with NO gaps: each new clip starts where the last ended. The Export/compile concatenates them under the song into one MP4.
- Gallery import drops existing video in as B-roll (with the current filter).
- A bottom filmstrip timeline shows each clip; tap a clip to trim it with yellow handles (in/out). Trims and filters are baked into the export.
- Filters (baked at compile): None, Warm, Vivid, Noir, VCR, Trippy, Negative, Photo Neg.
- BPM + Snap: a project can have a BPM. When Snap is on, every clip's cut length is snapped to the nearest beat so cuts land on the grid.

EDITING MATH YOU KNOW COLD:
- Seconds per beat = 60 / BPM. Example: 120 BPM -> 0.5s/beat.
- One bar in 4/4 = 4 beats = 240 / BPM seconds (120 BPM -> 2.0s/bar). The downbeat repeats every bar.
- A good cut/transition map puts cuts on beats (or every 1/2 or 1 bar). For punchy edits, cut every 2 beats; for cinematic, every 1-2 bars.
- To fit B-roll between clips: size each B-roll insert to a whole number of beats (e.g., 2 or 4 beats) so it lands on the next downbeat.
- Snap-to-grid keeps every cut beat-accurate: round each clip length to the nearest multiple of 60/BPM.

YOUR JOB: Watch what the user is trying to do and speed it up — suggest BPM-based cut maps, transition timing, where to drop B-roll, which filter fits the vibe, and exact second values using the math above. Be concise, concrete, and give real numbers. If they tell you the BPM and how many clips, lay out a beat-by-beat cut plan."""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    mode: str = "builtin"          # builtin | custom
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


@api_router.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(400, "No messages")
    try:
        if req.mode == "custom":
            if not req.base_url or not req.model:
                raise HTTPException(400, "Custom mode needs base_url and model")
            url = req.base_url.rstrip("/") + "/chat/completions"
            payload = {
                "model": req.model,
                "messages": [{"role": "system", "content": SYSTEM_PROMPT}]
                + [{"role": m.role, "content": m.content} for m in req.messages],
                "temperature": 0.7,
            }
            headers = {"Content-Type": "application/json"}
            if req.api_key:
                headers["Authorization"] = f"Bearer {req.api_key}"
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(url, json=payload, headers=headers)
                r.raise_for_status()
                data = r.json()
            return {"reply": data["choices"][0]["message"]["content"]}

        # Built-in: Emergent Universal Key -> Claude Sonnet 4.6
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        chat = LlmChat(
            api_key=key,
            session_id=str(uuid.uuid4()),
            system_message=SYSTEM_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-6")
        history = req.messages[:-1]
        last = req.messages[-1]
        if history:
            ctx = "\n".join(f"{m.role.upper()}: {m.content}" for m in history[-8:])
            text = f"[Conversation so far]\n{ctx}\n\n[New message]\n{last.content}"
        else:
            text = last.content
        reply = await chat.send_message(UserMessage(text=text))
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("AI chat failed: %s", e)
        raise HTTPException(500, f"AI error: {str(e)[:200]}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
