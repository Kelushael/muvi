const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Clip = {
  id: string;
  filename: string;
  url: string;
  song_start: number;
  duration: number;
  trim_start: number;
  trim_end: number;
  source: string;
  filter: string;
  created_at: string;
};

export type Project = {
  id: string;
  title: string;
  audio_filename: string;
  audio_url: string;
  audio_duration: number;
  clips: Clip[];
  output_url: string | null;
  created_at: string;
  updated_at: string;
};

export const fullUrl = (p?: string | null): string => {
  if (!p) return "";
  return p.startsWith("http") ? p : `${BASE}${p}`;
};

async function asJson(res: Response) {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
  return res.json();
}

type PickedFile = { uri: string; name?: string; mimeType?: string };

export const api = {
  list: (): Promise<Project[]> => fetch(`${BASE}/api/projects`).then(asJson),

  get: (id: string): Promise<Project> =>
    fetch(`${BASE}/api/projects/${id}`).then(asJson),

  create: (title: string, audio: PickedFile): Promise<Project> => {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("audio", {
      // @ts-ignore react-native FormData file
      uri: audio.uri,
      name: audio.name || "track.mp3",
      type: audio.mimeType || "audio/mpeg",
    });
    return fetch(`${BASE}/api/projects`, { method: "POST", body: fd }).then(asJson);
  },

  addClip: (
    id: string,
    uri: string,
    songStart: number,
    source: string,
    filter: string,
  ): Promise<Project> => {
    const fd = new FormData();
    fd.append("song_start", String(songStart));
    fd.append("source", source);
    fd.append("filter", filter);
    fd.append("video", {
      // @ts-ignore react-native FormData file
      uri,
      name: "clip.mp4",
      type: "video/mp4",
    });
    return fetch(`${BASE}/api/projects/${id}/clips`, {
      method: "POST",
      body: fd,
    }).then(asJson);
  },

  deleteClip: (id: string, clipId: string): Promise<Project> =>
    fetch(`${BASE}/api/projects/${id}/clips/${clipId}`, {
      method: "DELETE",
    }).then(asJson),

  updateClip: (
    id: string,
    clipId: string,
    body: { trim_start?: number; trim_end?: number; song_start?: number },
  ): Promise<Project> =>
    fetch(`${BASE}/api/projects/${id}/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(asJson),

  compile: (id: string): Promise<Project> =>
    fetch(`${BASE}/api/projects/${id}/compile`, { method: "POST" }).then(asJson),

  remove: (id: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/api/projects/${id}`, { method: "DELETE" }).then(asJson),
};
