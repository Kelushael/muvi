import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { colors, font, radius, spacing, fmtTime } from "../theme";
import type { Clip } from "../api";

const BAR_H = 56;
const HANDLE = 24;

type Props = {
  clip: Clip;
  width: number;
  onCommit: (trimStart: number, trimEnd: number) => void;
  onDelete: () => void;
  onClose: () => void;
};

export default function TrimBar({ clip, width, onCommit, onDelete, onClose }: Props) {
  const dur = clip.duration > 0 ? clip.duration : 1;
  const initTs = Math.max(clip.trim_start || 0, 0);
  const initTe = clip.trim_end && clip.trim_end > 0 ? Math.min(clip.trim_end, dur) : dur;
  const MIN = 0.3;
  const W = width;

  const ts = useSharedValue(initTs);
  const te = useSharedValue(initTe);
  const startTs = useSharedValue(0);
  const startTe = useSharedValue(0);

  const [tsL, setTsL] = useState(initTs);
  const [teL, setTeL] = useState(initTe);

  const commit = () => onCommit(ts.value, te.value);

  const leftPan = Gesture.Pan()
    .onBegin(() => {
      startTs.value = ts.value;
    })
    .onUpdate((e) => {
      let n = startTs.value + (e.translationX / W) * dur;
      n = Math.max(0, Math.min(n, te.value - MIN));
      ts.value = n;
      runOnJS(setTsL)(n);
    })
    .onEnd(() => runOnJS(commit)());

  const rightPan = Gesture.Pan()
    .onBegin(() => {
      startTe.value = te.value;
    })
    .onUpdate((e) => {
      let n = startTe.value + (e.translationX / W) * dur;
      n = Math.min(dur, Math.max(n, ts.value + MIN));
      te.value = n;
      runOnJS(setTeL)(n);
    })
    .onEnd(() => runOnJS(commit)());

  const fillStyle = useAnimatedStyle(() => ({
    left: (ts.value / dur) * W,
    width: ((te.value - ts.value) / dur) * W,
  }));
  const leftStyle = useAnimatedStyle(() => ({ left: (ts.value / dur) * W - HANDLE / 2 }));
  const rightStyle = useAnimatedStyle(() => ({ left: (te.value / dur) * W - HANDLE / 2 }));

  return (
    <View testID="trim-bar" style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TRIM CLIP</Text>
        <Text style={styles.len}>
          {fmtTime(teL - tsL)} <Text style={styles.lenDim}>of {fmtTime(dur)}</Text>
        </Text>
      </View>
      <View style={[styles.bar, { width: W }]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={[styles.ghost, { left: (i / 12) * W, width: W / 12 - 2 }]} />
        ))}
        <Animated.View style={[styles.fill, fillStyle]} />
        <GestureDetector gesture={leftPan}>
          <Animated.View style={[styles.handle, leftStyle]} testID="trim-handle-left">
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={rightPan}>
          <Animated.View style={[styles.handle, rightStyle]} testID="trim-handle-right">
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.delBtn} onPress={onDelete} testID="trim-delete">
          <Ionicons name="trash-outline" size={18} color={colors.brandPrimary} />
          <Text style={[styles.actTxt, { color: colors.brandPrimary }]}>Delete</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={onClose} testID="trim-done">
          <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />
          <Text style={[styles.actTxt, { color: colors.onBrandPrimary }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  title: { color: colors.warning, fontFamily: font.displaySemi, fontSize: 13, letterSpacing: 2 },
  len: { color: colors.onSurface, fontFamily: font.display, fontSize: 16 },
  lenDim: { color: colors.info },
  bar: {
    height: BAR_H,
    backgroundColor: "rgba(13,14,18,0.7)",
    borderRadius: radius.sm,
    overflow: "visible",
    justifyContent: "center",
  },
  ghost: {
    position: "absolute",
    top: 4,
    bottom: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
  },
  dim: { position: "absolute", top: 0, bottom: 0 },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: colors.warning,
    borderRadius: 6,
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  handle: {
    position: "absolute",
    top: -2,
    height: BAR_H + 4,
    width: HANDLE,
    backgroundColor: colors.warning,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  grip: { width: 3, height: 22, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.55)" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  delBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: "rgba(255,59,74,0.08)",
  },
  doneBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  actTxt: { fontFamily: font.bodyBold, fontSize: 15 },
});
