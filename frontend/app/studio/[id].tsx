import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, fullUrl, Project, Clip } from "@/src/api";
import { colors, font, spacing, radius, fmtTime } from "@/src/theme";
import Waveform from "@/src/components/Waveform";
import BottomTimeline from "@/src/components/BottomTimeline";
import TrimBar from "@/src/components/TrimBar";

const FILTERS = [
  { key: "none", label: "None", tint: "transparent" },
  { key: "warm", label: "Warm", tint: "rgba(255,138,46,0.20)" },
  { key: "vivid", label: "Vivid", tint: "rgba(255,59,74,0.16)" },
  { key: "noir", label: "Noir", tint: "rgba(0,0,0,0.40)" },
  { key: "vcr", label: "VCR", tint: "rgba(70,200,150,0.16)" },
  { key: "trippy", label: "Trippy", tint: "rgba(180,60,220,0.20)" },
  { key: "negative", label: "Negative", tint: "rgba(120,120,255,0.18)" },
  { key: "photoneg", label: "Photo Neg", tint: "rgba(210,210,210,0.22)" },
];

export default function StudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const p = await api.get(id);
      setProject(p);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={styles.loaderWrap}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.info} />
        <Text style={styles.loaderText}>Failed to load project</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!project) {
    return (
      <View style={styles.loaderWrap} testID="studio-loading">
        <ActivityIndicator color={colors.brandPrimary} />
        <Text style={styles.loaderText}>Loading studio...</Text>
      </View>
    );
  }
  return <StudioInner project={project} setProject={setProject} />;
}

function StudioInner({
  project,
  setProject,
}: {
  project: Project;
  setProject: (p: Project) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const timelineW = width - spacing.lg * 2;

  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);

  const player = useAudioPlayer({ uri: fullUrl(project.audio_url) });
  const status = useAudioPlayerStatus(player);
  const position = status?.currentTime ?? 0;
  const playing = status?.playing ?? false;
  const duration = project.audio_duration || status?.duration || 1;

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [filterIdx, setFilterIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef(false);
  const songStartRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [menuClip, setMenuClip] = useState<Clip | null>(null);
  const [trimClip, setTrimClip] = useState<Clip | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [showBpm, setShowBpm] = useState(false);
  const [bpmDraft, setBpmDraft] = useState("");
  const [snapDraft, setSnapDraft] = useState(true);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      try {
        player.pause();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filter = FILTERS[filterIdx];

  const togglePlay = () => {
    Haptics.selectionAsync();
    if (playing) player.pause();
    else player.play();
  };

  const seek = (sec: number) => {
    player.seekTo(sec);
  };

  const uploadClip = async (uri: string, songStart: number, source: string) => {
    setUploading(true);
    try {
      const updated = await api.addClip(project.id, uri, songStart, source, filter.key);
      setProject(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log("upload clip failed", e);
    } finally {
      setUploading(false);
    }
  };

  const startRec = async () => {
    if (recordingRef.current) return;
    if (!playing) player.play();
    songStartRef.current = position;
    recordingRef.current = true;
    setIsRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const video = await camRef.current?.recordAsync({ maxDuration: 10 });
      if (video?.uri) {
        await uploadClip(video.uri, songStartRef.current, "camera");
      }
    } catch (e) {
      console.log("record failed", e);
    } finally {
      recordingRef.current = false;
      setIsRecording(false);
    }
  };

  const stopRec = () => {
    if (!recordingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    camRef.current?.stopRecording();
    // Music keeps playing — only the recording stops (punch-out).
  };

  const onRecordPress = () => (isRecording ? stopRec() : startRec());

  const importVideo = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
    });
    if (!res.canceled && res.assets?.[0]) {
      await uploadClip(res.assets[0].uri, position, "gallery");
    }
  };

  const revertLast = async () => {
    if (project.clips.length === 0) return;
    const last = [...project.clips].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    )[0];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await api.deleteClip(project.id, last.id);
      setProject(updated);
    } catch {}
  };

  const deleteClip = async (clip: Clip) => {
    setMenuClip(null);
    setSelectedClip(null);
    try {
      const updated = await api.deleteClip(project.id, clip.id);
      setProject(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  const updateTrim = async (clip: Clip, ts: number, te: number) => {
    try {
      const updated = await api.updateClip(project.id, clip.id, {
        trim_start: ts,
        trim_end: te,
      });
      setProject(updated);
    } catch {}
  };

  // ---- Permission gate ----
  const camGranted = camPerm?.granted;
  const micGranted = micPerm?.granted;
  if (!camGranted || !micGranted) {
    const blocked =
      (camPerm && !camPerm.granted && !camPerm.canAskAgain) ||
      (micPerm && !micPerm.granted && !micPerm.canAskAgain);
    return (
      <View style={[styles.permWrap, { paddingTop: insets.top }]}>
        <Pressable style={styles.backTop} onPress={() => router.back()} testID="studio-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={styles.permCenter}>
          <View style={styles.permIcon}>
            <Ionicons name="videocam" size={36} color={colors.brandPrimary} />
          </View>
          <Text style={styles.permTitle}>Camera & Mic access</Text>
          <Text style={styles.permBody}>
            BeatCam needs your camera and microphone to film clips while your track plays.
          </Text>
          {blocked ? (
            <Pressable
              testID="open-settings-btn"
              style={styles.primaryCta}
              onPress={() => Linking.openSettings()}
            >
              <Ionicons name="settings-outline" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryCtaText}>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="grant-permissions-btn"
              style={styles.primaryCta}
              onPress={async () => {
                if (!camGranted) await requestCam();
                if (!micGranted) await requestMic();
              }}
            >
              <Ionicons name="lock-open-outline" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryCtaText}>Allow access</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode="video"
      />
      {/* Filter tint */}
      {filter.tint !== "transparent" && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: filter.tint }]}
        />
      )}

      {/* Top scrim */}
      <LinearGradient
        colors={["rgba(0,0,0,0.85)", "transparent"]}
        style={styles.topScrim}
        pointerEvents="none"
      />
      {/* Bottom scrim */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.9)"]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* ===== Top: title + timeline ===== */}
      <View style={[styles.topArea, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.topRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="studio-back">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {project.title}
          </Text>
          <Pressable
            style={styles.iconBtn}
            onPress={revertLast}
            testID="revert-btn"
            disabled={project.clips.length === 0}
          >
            <Ionicons
              name="arrow-undo"
              size={20}
              color={project.clips.length ? colors.onSurface : colors.info}
            />
          </Pressable>
        </View>

        <BlurView intensity={30} tint="dark" style={styles.timelineGlass}>
          <View style={styles.timelineHeaderRow}>
            <Pressable onPress={togglePlay} style={styles.playBtn} testID="play-toggle">
              <Ionicons
                name={playing ? "pause" : "play"}
                size={16}
                color={colors.onBrandPrimary}
              />
            </Pressable>
            <Text style={styles.timeLabel}>
              {fmtTime(position)} <Text style={styles.timeDim}>/ {fmtTime(duration)}</Text>
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.bpmPill} onPress={openBpm} testID="bpm-pill">
              <Ionicons name="speedometer-outline" size={13} color={colors.brandSecondary} />
              <Text style={styles.bpmTxt}>
                {project.bpm ? `${Math.round(project.bpm)} BPM` : "SET BPM"}
              </Text>
            </Pressable>
            <Text style={styles.clipCount}>{project.clips.length} CLIPS</Text>
          </View>
          <Waveform
            width={timelineW}
            duration={duration}
            position={position}
            clips={project.clips}
            selectedClipId={selectedClip?.id ?? null}
            onSeek={seek}
            onSelectClip={(c) => setSelectedClip(c)}
            onClipMenu={(c) => setMenuClip(c)}
          />
        </BlurView>
      </View>

      {/* ===== Right tool strip ===== */}
      <View style={[styles.toolStrip, { top: insets.top + 160 }]}>
        <Pressable
          style={styles.toolBtn}
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          testID="flip-camera-btn"
        >
          <Ionicons name="camera-reverse-outline" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={importVideo} testID="import-gallery-btn">
          <Ionicons name="images-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {uploading && (
        <View style={styles.uploadBadge} testID="uploading-badge">
          <ActivityIndicator color={colors.onBrandPrimary} size="small" />
          <Text style={styles.uploadText}>Saving clip…</Text>
        </View>
      )}

      {countdown > 0 && (
        <View pointerEvents="none" style={styles.countdownOverlay} testID="countdown-overlay">
          <Text style={styles.countdownNum}>{countdown}</Text>
        </View>
      )}

      {/* ===== Bottom controls ===== */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + spacing.md }]}>
        {trimClip ? (
          <TrimBar
            key={trimClip.id}
            clip={trimClip}
            width={timelineW}
            onCommit={(ts, te) => updateTrim(trimClip, ts, te)}
            onDelete={() => {
              deleteClip(trimClip);
              setTrimClip(null);
            }}
            onClose={() => {
              setTrimClip(null);
              setSelectedClip(null);
            }}
          />
        ) : (
          <BottomTimeline
            width={timelineW}
            duration={duration}
            bpm={project.bpm}
            position={position}
            clips={project.clips}
            selectedClipId={selectedClip?.id ?? null}
            bpm={project.bpm}
            onSeek={seek}
            onSelectClip={(c) => {
              setSelectedClip(c);
              setTrimClip(c);
            }}
          />
        )}

        {/* Filter carousel */}
        {!trimClip && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            {FILTERS.map((f, i) => (
            <Pressable
              key={f.key}
              testID={`filter-${f.key}`}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterIdx(i);
              }}
              style={[
                styles.filterChip,
                i === filterIdx && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  i === filterIdx && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
          </ScrollView>
        )}

        <View style={styles.recordRow}>
          <View style={styles.transportCluster}>
            <Pressable style={styles.transportBtn} onPress={rewind} testID="rewind-btn">
              <Ionicons name="play-skip-back" size={20} color={colors.onSurface} />
            </Pressable>
            <Pressable style={styles.transportBtn} onPress={togglePlay} testID="playpause-btn">
              <Ionicons name={playing ? "pause" : "play"} size={20} color={colors.onSurface} />
            </Pressable>
          </View>
          <Pressable
            testID="record-btn"
            onPress={beginCountdownAndRecord}
            disabled={countdown > 0}
            style={styles.recordOuter}
          >
            <View
              style={[
                styles.recordInner,
                isRecording && styles.recordInnerActive,
              ]}
            />
            {isRecording && <View style={styles.recordRing} />}
          </Pressable>
          <View style={[styles.transportCluster, { justifyContent: "flex-end" }]}>
            <Pressable
              testID="export-btn"
              style={styles.exportPill}
              onPress={() => {
                player.pause();
                router.push(`/preview/${project.id}`);
              }}
            >
              <Ionicons name="share-outline" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.exportPillTxt}>Export</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.hint}>
          {countdown > 0
            ? `Get ready… ${countdown}`
            : isRecording
            ? "● REC — max 10s · tap to stop"
            : "Tap ● to punch in a clip (≤10s)"}
        </Text>
      </View>

      {/* ===== Clip context menu (double-tap) ===== */}
      {menuClip && (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuClip(null)}
          testID="clip-menu-backdrop"
        >
          <BlurView intensity={50} tint="dark" style={styles.clipMenu}>
            <Text style={styles.menuTitle}>
              CLIP @ {fmtTime(menuClip.song_start)} · {menuClip.source}
            </Text>
            <Pressable
              style={styles.menuItem}
              testID="menu-delete-clip"
              onPress={() => deleteClip(menuClip)}
            >
              <Ionicons name="trash-outline" size={18} color={colors.brandPrimary} />
              <Text style={[styles.menuItemText, { color: colors.brandPrimary }]}>Delete</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              testID="menu-close"
              onPress={() => setMenuClip(null)}
            >
              <Ionicons name="close-outline" size={18} color={colors.onSurface} />
              <Text style={styles.menuItemText}>Close</Text>
            </Pressable>
          </BlurView>
        </Pressable>
      )}

      <Modal visible={showBpm} transparent animationType="fade" onRequestClose={() => setShowBpm(false)}>
        <Pressable style={styles.bpmBackdrop} onPress={() => setShowBpm(false)}>
          <Pressable style={styles.bpmCard} onPress={() => {}}>
            <Text style={styles.bpmCardTitle}>BEAT GRID</Text>
            <Text style={styles.bpmCardHint}>
              Set the song BPM and every cut snaps to the beat on export.
            </Text>
            <TextInput
              style={styles.bpmInput}
              value={bpmDraft}
              onChangeText={setBpmDraft}
              keyboardType="numeric"
              placeholder="e.g. 120"
              placeholderTextColor={colors.info}
              testID="bpm-input"
            />
            <View style={styles.bpmSnapRow}>
              <Text style={styles.bpmSnapTxt}>Snap cuts to beat</Text>
              <Switch
                value={snapDraft}
                onValueChange={setSnapDraft}
                trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
                thumbColor={colors.onSurface}
                testID="snap-switch"
              />
            </View>
            <Pressable style={styles.bpmSave} onPress={saveBpm} testID="bpm-save">
              <Text style={styles.bpmSaveTxt}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loaderWrap: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loaderText: { color: colors.info, fontFamily: font.body },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onSurface, fontFamily: font.bodyMed },

  // permissions
  permWrap: { flex: 1, backgroundColor: colors.surface },
  backTop: { padding: spacing.md, width: 50 },
  permCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  permIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 26, letterSpacing: 1 },
  permBody: { color: colors.info, fontFamily: font.body, fontSize: 14, textAlign: "center", lineHeight: 20 },

  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 230 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 280 },

  topArea: { paddingHorizontal: spacing.lg },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(26,28,35,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", color: colors.onSurface, fontFamily: font.displaySemi, fontSize: 20, letterSpacing: 0.5, marginHorizontal: spacing.sm },
  timelineGlass: {
    borderRadius: radius.md,
    padding: spacing.md,
    paddingTop: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timelineHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: { color: colors.onSurface, fontFamily: font.display, fontSize: 16, letterSpacing: 0.5 },
  timeDim: { color: colors.info },
  clipCount: { color: colors.brandSecondary, fontFamily: font.displaySemi, fontSize: 12, letterSpacing: 1 },
  bpmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,122,132,0.14)",
    borderWidth: 1,
    borderColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  bpmTxt: { color: colors.brandSecondary, fontFamily: font.displaySemi, fontSize: 12, letterSpacing: 0.5 },
  bpmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  bpmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  bpmCardTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 1.5 },
  bpmCardHint: { color: colors.info, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  bpmInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontFamily: font.display,
    fontSize: 28,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  bpmSnapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  bpmSnapTxt: { color: colors.onSurface, fontFamily: font.bodyMed, fontSize: 15 },
  bpmSave: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  bpmSaveTxt: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 16 },

  toolStrip: { position: "absolute", right: spacing.lg, gap: spacing.md },
  toolBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(26,28,35,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  uploadBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(13,14,18,0.85)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  uploadText: { color: colors.onSurface, fontFamily: font.bodyMed, fontSize: 13 },

  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  filterRow: { marginBottom: spacing.lg },
  filterContent: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xs, alignItems: "center" },
  filterChip: {
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(26,28,35,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  filterText: { color: colors.onSurfaceSecondary, fontFamily: font.bodyMed, fontSize: 12 },
  filterTextActive: { color: colors.onSurfaceInverse, fontFamily: font.bodyBold },

  recordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transportCluster: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  transportBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(26,28,35,0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  exportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  exportPillTxt: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 13 },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  countdownNum: {
    color: colors.brandPrimary,
    fontFamily: font.display,
    fontSize: 160,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 20,
  },
  sideSlot: { width: 64, alignItems: "center", justifyContent: "center" },
  recordOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  recordInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandPrimary,
  },
  recordInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  recordRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: colors.brandPrimary,
  },
  nextBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { textAlign: "center", color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: 12, marginTop: spacing.md },

  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  clipMenu: {
    width: 220,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: spacing.sm,
  },
  menuTitle: { color: colors.info, fontFamily: font.displaySemi, fontSize: 11, letterSpacing: 1, padding: spacing.sm, textTransform: "uppercase" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.sm },
  menuItemText: { color: colors.onSurface, fontFamily: font.bodyMed, fontSize: 15 },

  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  primaryCtaText: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 15 },
});
