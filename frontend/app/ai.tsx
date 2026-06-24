import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors, font, spacing, radius } from "@/src/theme";

type Msg = { role: "user" | "assistant"; content: string };
type Cfg = { mode: string; base_url: string; api_key: string; model: string };

const DEFAULT_CFG: Cfg = { mode: "builtin", base_url: "", api_key: "", model: "" };
const SUGGESTIONS = [
  "Make me a cut map for 128 BPM, 12 clips",
  "Where should I drop B-roll on the downbeat?",
  "Which filter fits a moody trap video?",
  "How long should each clip be at 90 BPM?",
];

export default function AIScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Cfg>(DEFAULT_CFG);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>("ai_cfg", "");
      if (saved) {
        try {
          setCfg({ ...DEFAULT_CFG, ...JSON.parse(saved) });
        } catch {}
      }
    })();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || sending) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = [...messages, { role: "user" as const, content: q }];
      setMessages(next);
      setInput("");
      setSending(true);
      try {
        const res = await api.aiChat({
          messages: next,
          mode: cfg.mode,
          base_url: cfg.base_url || undefined,
          api_key: cfg.api_key || undefined,
          model: cfg.model || undefined,
        });
        setMessages([...next, { role: "assistant", content: res.reply }]);
      } catch (e: any) {
        setMessages([
          ...next,
          {
            role: "assistant",
            content:
              "⚠️ Couldn't reach the model. " +
              (cfg.mode === "custom"
                ? "Check your base URL, key, and model in settings."
                : "Try again in a moment."),
          },
        ]);
      } finally {
        setSending(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [messages, sending, cfg],
  );

  const saveSettings = async () => {
    setCfg(draft);
    await storage.setItem("ai_cfg", JSON.stringify(draft));
    setShowSettings(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="ai-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.title}>BEATCAM COACH</Text>
          <Text style={styles.sub}>
            {cfg.mode === "custom" ? (cfg.model || "custom model") : "Built-in · Claude"}
          </Text>
        </View>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            setDraft(cfg);
            setShowSettings(true);
          }}
          testID="ai-settings-btn"
        >
          <Ionicons name="options-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.coachBadge}>
              <Ionicons name="sparkles" size={26} color={colors.brandPrimary} />
            </View>
            <Text style={styles.emptyTitle}>Your edit co-pilot</Text>
            <Text style={styles.emptyBody}>
              Ask me for beat-accurate cut maps, B-roll placement, transitions, and filter picks.
              I know your BPM math cold.
            </Text>
            <View style={{ gap: spacing.sm, width: "100%", marginTop: spacing.md }}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={styles.suggestion}
                  onPress={() => send(s)}
                  testID={`suggestion-${s.slice(0, 8)}`}
                >
                  <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.brandSecondary} />
                  <Text style={styles.suggestionTxt}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}
              testID={`msg-${m.role}-${i}`}
            >
              <Text style={m.role === "user" ? styles.userTxt : styles.aiTxt}>{m.content}</Text>
            </View>
          ))
        )}
        {sending && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about cuts, BPM, B-roll…"
          placeholderTextColor={colors.info}
          multiline
          testID="ai-input"
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
          testID="ai-send"
        >
          <Ionicons name="arrow-up" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {/* Settings modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setShowSettings(false)} />
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>AI Provider</Text>
            <Text style={styles.sheetBody}>
              Use the built-in model, or bring any OpenAI-compatible endpoint — OpenAI, OpenRouter,
              Groq, llama.cpp, Ollama, or your own server.
            </Text>

            <View style={styles.modeRow}>
              {["builtin", "custom"].map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeChip, draft.mode === m && styles.modeChipActive]}
                  onPress={() => setDraft({ ...draft, mode: m })}
                  testID={`mode-${m}`}
                >
                  <Text style={[styles.modeTxt, draft.mode === m && styles.modeTxtActive]}>
                    {m === "builtin" ? "Built-in" : "Bring your own"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {draft.mode === "custom" && (
              <>
                <Text style={styles.label}>Base URL (OpenAI-compatible)</Text>
                <TextInput
                  style={styles.cfgInput}
                  value={draft.base_url}
                  onChangeText={(t) => setDraft({ ...draft, base_url: t })}
                  placeholder="http://your-server:8080/v1"
                  placeholderTextColor={colors.info}
                  autoCapitalize="none"
                  testID="cfg-baseurl"
                />
                <Text style={styles.label}>API Key (optional for local)</Text>
                <TextInput
                  style={styles.cfgInput}
                  value={draft.api_key}
                  onChangeText={(t) => setDraft({ ...draft, api_key: t })}
                  placeholder="sk-…"
                  placeholderTextColor={colors.info}
                  autoCapitalize="none"
                  secureTextEntry
                  testID="cfg-key"
                />
                <Text style={styles.label}>Model</Text>
                <TextInput
                  style={styles.cfgInput}
                  value={draft.model}
                  onChangeText={(t) => setDraft({ ...draft, model: t })}
                  placeholder="gpt-4o / llama-3.1-8b-instruct"
                  placeholderTextColor={colors.info}
                  autoCapitalize="none"
                  testID="cfg-model"
                />
              </>
            )}

            <Pressable style={styles.saveBtn} onPress={saveSettings} testID="cfg-save">
              <Text style={styles.saveTxt}>Save</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.onSurface, fontFamily: font.display, fontSize: 20, letterSpacing: 1.5 },
  sub: { color: colors.brandSecondary, fontFamily: font.displaySemi, fontSize: 11, letterSpacing: 1 },
  scroll: { flex: 1 },
  empty: { alignItems: "center", paddingTop: spacing.xxl, gap: spacing.sm },
  coachBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 0.5 },
  emptyBody: { color: colors.info, fontFamily: font.body, fontSize: 14, textAlign: "center", lineHeight: 20 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  suggestionTxt: { color: colors.onSurfaceSecondary, fontFamily: font.bodyMed, fontSize: 13, flex: 1 },
  bubble: { maxWidth: "88%", borderRadius: radius.md, padding: spacing.md },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  userTxt: { color: colors.onBrandPrimary, fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  aiTxt: { color: colors.onSurface, fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontFamily: font.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetScroll: { maxHeight: "82%" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 1 },
  sheetBody: { color: colors.info, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: spacing.sm },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  modeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  modeTxt: { color: colors.onSurfaceSecondary, fontFamily: font.bodyMed, fontSize: 14 },
  modeTxtActive: { color: colors.onSurfaceInverse, fontFamily: font.bodyBold },
  label: { color: colors.onSurfaceTertiary, fontFamily: font.bodyMed, fontSize: 13, marginTop: spacing.sm },
  cfgInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    fontFamily: font.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  saveTxt: { color: colors.onBrandPrimary, fontFamily: font.bodyBold, fontSize: 16 },
});
