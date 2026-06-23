import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, fullUrl, Project } from "@/src/api";
import { colors, font, spacing, radius, fmtTime } from "@/src/theme";

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [project, setProject] = useState<Project | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (outputUrl) {
      try {
        player.replace({ uri: fullUrl(outputUrl) });
      } catch {}
    }
  }, [outputUrl, player]);

  const compile = useCallback(async () => {
    setCompiling(true);
    setError(null);
    try {
      const updated = await api.compile(id);
      setProject(updated);
      setOutputUrl(updated.output_url ?? null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError("Compilation failed. Make sure you have at least one clip.");
    } finally {
      setCompiling(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get(id);
        setProject(p);
        if (p.output_url) {
          setOutputUrl(p.output_url);
        } else {
          // auto-compile on first open
          setCompiling(true);
          const updated = await api.compile(id);
          setProject(updated);
          setOutputUrl(updated.output_url ?? null);
          setCompiling(false);
        }
      } catch {
        setError("Compilation failed. Make sure you have at least one clip.");
        setCompiling(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onShare = async () => {
    if (!outputUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Check out my music video "${project?.title}" 🎬\n${fullUrl(outputUrl)}`,
    });
  };

  const onOpen = () => {
    if (outputUrl) Linking.openURL(fullUrl(outputUrl));
  };

  return (
    <View style={styles.container}>
      {/* Video stage */}
      <View style={styles.stage}>
        {outputUrl ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls
            testID="preview-video"
          />
        ) : (
          <View style={styles.placeholder}>
            {compiling ? (
              <>
                <ActivityIndicator color={colors.brandPrimary} size="large" />
                <Text style={styles.compileText}>Compiling video blocks…</Text>
                <Text style={styles.compileSub}>
                  Stitching {project?.clips.length ?? 0} clips under your track
                </Text>
              </>
            ) : error ? (
              <>
                <Ionicons name="warning-outline" size={44} color={colors.warning} />
                <Text style={styles.compileText}>{error}</Text>
                <Pressable style={styles.retryBtn} onPress={compile} testID="retry-compile">
                  <Text style={styles.retryText}>Retry Compilation</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colors.brandPrimary} />
            )}
          </View>
        )}
      </View>

      {/* Top bar */}
      <LinearGradient colors={["rgba(0,0,0,0.8)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="preview-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {project?.title ?? "Preview"}
          </Text>
          <Text style={styles.topSub}>{fmtTime(project?.audio_duration ?? 0)} · MUSIC VIDEO</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {/* Bottom action sheet */}
      <BlurView intensity={40} tint="dark" style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetRow}>
          <Pressable
            style={[styles.secondaryBtn, !outputUrl && styles.disabled]}
            onPress={compile}
            disabled={!outputUrl || compiling}
            testID="recompile-btn"
          >
            <Ionicons name="refresh" size={18} color={colors.onSurface} />
            <Text style={styles.secondaryText}>Recompile</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, !outputUrl && styles.disabled]}
            onPress={onOpen}
            disabled={!outputUrl}
            testID="open-btn"
          >
            <Ionicons name="open-outline" size={18} color={colors.onSurface} />
            <Text style={styles.secondaryText}>Open</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.exportBtn, !outputUrl && styles.disabled]}
          onPress={onShare}
          disabled={!outputUrl}
          testID="export-share-btn"
        >
          <Ionicons name="share-social" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.exportText}>Export & Share Video</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  stage: { flex: 1, backgroundColor: "#000" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  compileText: { color: colors.onSurface, fontFamily: font.displaySemi, fontSize: 18, letterSpacing: 0.5, textAlign: "center" },
  compileSub: { color: colors.info, fontFamily: font.body, fontSize: 13, textAlign: "center" },
  retryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  retryText: { color: colors.onBrandPrimary, fontFamily: font.bodyBold },

  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 140 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(26,28,35,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: colors.onSurface, fontFamily: font.displaySemi, fontSize: 18, letterSpacing: 0.5 },
  topSub: { color: colors.brandSecondary, fontFamily: font.displaySemi, fontSize: 11, letterSpacing: 1.5 },

  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  sheetRow: { flexDirection: "row", gap: spacing.md },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(39,42,53,0.8)",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.onSurface, fontFamily: font.bodyMed, fontSize: 14 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  exportText: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 16 },
  disabled: { opacity: 0.4 },
});
