import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";

import { api, fullUrl, Project } from "@/src/api";
import { colors, font, spacing, radius, fmtTime } from "@/src/theme";

const THUMBS = [
  "https://images.unsplash.com/photo-1687586370886-b31f1c557df5?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
  "https://images.unsplash.com/photo-1687586370817-c0c31d87f11b?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
  "https://images.unsplash.com/photo-1515846865653-cfda085cca48?crop=entropy&cs=srgb&fm=jpg&w=400&q=70",
];

export default function ProjectsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [picked, setPicked] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const data = await api.list();
      setProjects(data);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pickAudio = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType });
      setTitle((a.name || "New Track").replace(/\.[^.]+$/, ""));
    }
  };

  const confirmCreate = async () => {
    if (!picked) return;
    setCreating(true);
    try {
      const proj = await api.create(title.trim() || "Untitled", picked);
      setPicked(null);
      setTitle("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/studio/${proj.id}`);
    } catch (e) {
      setError(true);
    } finally {
      setCreating(false);
    }
  };

  const removeProject = async (id: string) => {
    setProjects((p) => p.filter((x) => x.id !== id));
    try {
      await api.remove(id);
    } catch {
      load();
    }
  };

  const renderCard = ({ item, index }: { item: Project; index: number }) => (
    <Pressable
      testID={`project-card-${item.id}`}
      style={styles.card}
      onPress={() => router.push(`/studio/${item.id}`)}
    >
      <Image
        source={{ uri: item.output_url ? fullUrl(item.output_url) : THUMBS[index % THUMBS.length] }}
        style={styles.thumb}
        contentFit="cover"
        transition={250}
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="film-outline" size={12} color={colors.onSurfaceTertiary} />
            <Text style={styles.metaText}>{item.clips.length} clips</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="musical-notes-outline" size={12} color={colors.onSurfaceTertiary} />
            <Text style={styles.metaText}>{fmtTime(item.audio_duration)}</Text>
          </View>
          {item.output_url ? (
            <View style={[styles.metaPill, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.brandSecondary} />
              <Text style={[styles.metaText, { color: colors.brandSecondary }]}>Compiled</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        testID={`delete-project-${item.id}`}
        hitSlop={10}
        style={styles.cardDelete}
        onPress={() => removeProject(item.id)}
      >
        <Ionicons name="trash-outline" size={18} color={colors.info} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSub}>BEATCAM</Text>
          <Text style={styles.brandTitle}>STUDIO</Text>
        </View>
        <View style={styles.logoBadge}>
          <Ionicons name="recording-outline" size={20} color={colors.brandPrimary} />
        </View>
      </View>

      {loading ? (
        <View style={styles.center} testID="projects-loading">
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.dimText}>Loading projects...</Text>
        </View>
      ) : error ? (
        <View style={styles.center} testID="projects-error">
          <Ionicons name="cloud-offline-outline" size={40} color={colors.info} />
          <Text style={styles.dimText}>Couldn&apos;t load projects</Text>
          <Pressable style={styles.retryBtn} onPress={load} testID="projects-retry">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.center} testID="projects-empty">
          <Ionicons name="musical-note" size={48} color={colors.brandPrimary} />
          <Text style={styles.emptyTitle}>No projects yet</Text>
          <Text style={styles.dimText}>Upload an MP3 to start your first music video</Text>
          <Pressable style={styles.primaryCta} onPress={pickAudio} testID="empty-upload-cta">
            <Ionicons name="cloud-upload-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.primaryCtaText}>Upload MP3</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      {!loading && projects.length > 0 && (
        <Pressable
          testID="new-project-fab"
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
          onPress={pickAudio}
        >
          <Ionicons name="add" size={30} color={colors.onBrandPrimary} />
        </Pressable>
      )}

      {/* Create modal */}
      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPicked(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Music Video</Text>
            <Text style={styles.dimText}>{picked?.name}</Text>
            <Text style={styles.label}>Project title</Text>
            <TextInput
              testID="project-title-input"
              value={title}
              onChangeText={setTitle}
              placeholder="My music video"
              placeholderTextColor={colors.info}
              style={styles.input}
              autoFocus
            />
            <Pressable
              testID="create-project-confirm"
              style={[styles.primaryCta, { marginTop: spacing.lg, opacity: creating ? 0.6 : 1 }]}
              onPress={confirmCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons name="videocam" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryCtaText}>Open Studio</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <LinearGradient
        colors={["transparent", colors.surface]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  brandSub: {
    color: colors.brandPrimary,
    fontFamily: font.displaySemi,
    fontSize: 14,
    letterSpacing: 3,
  },
  brandTitle: {
    color: colors.onSurface,
    fontFamily: font.display,
    fontSize: 34,
    letterSpacing: 2,
    lineHeight: 36,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  dimText: { color: colors.info, fontFamily: font.body, fontSize: 14, textAlign: "center" },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 1 },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  primaryCtaText: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 15 },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onSurface, fontFamily: font.bodyMed },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    alignItems: "center",
  },
  thumb: { width: 92, height: 92 },
  cardBody: { flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm },
  cardTitle: { color: colors.onSurface, fontFamily: font.displaySemi, fontSize: 20, letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  metaText: { color: colors.onSurfaceTertiary, fontFamily: font.bodyMed, fontSize: 11 },
  cardDelete: { padding: spacing.md },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 1 },
  label: { color: colors.onSurfaceTertiary, fontFamily: font.bodyMed, fontSize: 13, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 80 },
});
