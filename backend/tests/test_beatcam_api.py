"""BeatCam Studio backend API tests."""
import os
import subprocess
import json
import pytest

MEDIA_DIR = "/tmp/beatcam_media"
MP3 = f"{MEDIA_DIR}/t.mp3"
CLIP1 = f"{MEDIA_DIR}/c1.mp4"
CLIP2 = f"{MEDIA_DIR}/c2.mp4"


# ---------------------------- Helpers ----------------------------
def _ffprobe_streams(url_or_path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format",
         "-of", "json", url_or_path],
        capture_output=True, text=True, timeout=60,
    )
    return json.loads(out.stdout or "{}")


# ---------------------------- Root ----------------------------
class TestRoot:
    def test_api_root_ok(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("message") == "BeatCam Studio API"


# ---------------------------- Projects CRUD ----------------------------
class TestProjects:
    project_id = None

    def test_list_projects_returns_array_no_id_leak(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for p in data:
            assert "_id" not in p

    def test_create_project_multipart(self, api_client, base_url):
        with open(MP3, "rb") as f:
            r = api_client.post(
                f"{base_url}/api/projects",
                data={"title": "TEST_beatcam"},
                files={"audio": ("t.mp3", f, "audio/mpeg")},
            )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["title"] == "TEST_beatcam"
        assert "_id" not in p
        assert p["audio_url"].startswith("/api/media/audio/")
        # ffprobe-computed duration ~6s
        assert 5.5 < p["audio_duration"] < 6.5
        assert p["clips"] == []
        assert p["output_url"] is None
        TestProjects.project_id = p["id"]

    def test_get_project(self, api_client, base_url):
        pid = TestProjects.project_id
        assert pid
        r = api_client.get(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_nonexistent_project_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects/nonexistent-id")
        assert r.status_code == 404


# ---------------------------- Clips ----------------------------
class TestClips:
    def test_compile_zero_clips_returns_400(self, api_client, base_url):
        pid = TestProjects.project_id
        r = api_client.post(f"{base_url}/api/projects/{pid}/compile")
        assert r.status_code == 400

    def test_add_clip_at_song_start_0(self, api_client, base_url):
        pid = TestProjects.project_id
        with open(CLIP1, "rb") as f:
            r = api_client.post(
                f"{base_url}/api/projects/{pid}/clips",
                data={"song_start": "0", "source": "camera", "filter": "warm"},
                files={"video": ("c1.mp4", f, "video/mp4")},
            )
        assert r.status_code == 200, r.text
        p = r.json()
        assert len(p["clips"]) == 1
        c = p["clips"][0]
        assert c["song_start"] == 0
        assert 1.5 < c["duration"] < 2.5
        assert c["source"] == "camera"
        assert c["filter"] == "warm"
        assert p["output_url"] is None

    def test_add_clip_at_song_start_3(self, api_client, base_url):
        pid = TestProjects.project_id
        with open(CLIP2, "rb") as f:
            r = api_client.post(
                f"{base_url}/api/projects/{pid}/clips",
                data={"song_start": "3", "source": "gallery", "filter": "none"},
                files={"video": ("c2.mp4", f, "video/mp4")},
            )
        assert r.status_code == 200, r.text
        p = r.json()
        assert len(p["clips"]) == 2

    def test_add_clip_to_unknown_project_404(self, api_client, base_url):
        with open(CLIP1, "rb") as f:
            r = api_client.post(
                f"{base_url}/api/projects/does-not-exist/clips",
                data={"song_start": "0", "source": "camera", "filter": "none"},
                files={"video": ("c1.mp4", f, "video/mp4")},
            )
        assert r.status_code == 404


# ---------------------------- Compile ----------------------------
class TestCompile:
    output_url = None

    def test_compile_success(self, api_client, base_url):
        pid = TestProjects.project_id
        r = api_client.post(f"{base_url}/api/projects/{pid}/compile", timeout=240)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["output_url"] is not None
        assert p["output_url"].startswith("/api/media/output/")
        TestCompile.output_url = p["output_url"]

    def test_compiled_video_served_and_valid(self, api_client, base_url):
        assert TestCompile.output_url
        url = f"{base_url}{TestCompile.output_url}"
        r = api_client.head(url, allow_redirects=True)
        # some servers don't support HEAD on FileResponse, fallback to GET stream
        if r.status_code != 200:
            r = api_client.get(url, stream=True)
        assert r.status_code == 200

        # validate mp4 structure with ffprobe over HTTP
        info = _ffprobe_streams(url)
        streams = info.get("streams", [])
        kinds = {s.get("codec_type") for s in streams}
        assert "video" in kinds, f"no video stream: {streams}"
        assert "audio" in kinds, f"no audio stream: {streams}"
        dur = float(info.get("format", {}).get("duration", 0))
        # audio is 6s, output should be ~6s
        assert 5.5 < dur < 7.0, f"unexpected duration {dur}"


# ---------------------------- Clip Delete ----------------------------
class TestClipDelete:
    def test_delete_clip_removes_and_resets_output(self, api_client, base_url):
        pid = TestProjects.project_id
        r = api_client.get(f"{base_url}/api/projects/{pid}")
        clips = r.json()["clips"]
        assert len(clips) == 2
        clip_id = clips[0]["id"]

        r2 = api_client.delete(f"{base_url}/api/projects/{pid}/clips/{clip_id}")
        assert r2.status_code == 200
        p = r2.json()
        assert len(p["clips"]) == 1
        assert all(c["id"] != clip_id for c in p["clips"])
        assert p["output_url"] is None  # reset on clip change


# ---------------------------- Media ----------------------------
class TestMedia:
    def test_unknown_media_kind_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/media/bogus/anything.mp4")
        assert r.status_code == 404

    def test_unknown_output_file_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/media/output/notthere.mp4")
        assert r.status_code == 404


# ---------------------------- Project Delete (cleanup) ----------------------------
class TestProjectDelete:
    def test_delete_project(self, api_client, base_url):
        pid = TestProjects.project_id
        r = api_client.delete(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_get_deleted_project_404(self, api_client, base_url):
        pid = TestProjects.project_id
        r = api_client.get(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 404

    def test_delete_unknown_project_404(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/projects/totally-fake")
        assert r.status_code == 404
