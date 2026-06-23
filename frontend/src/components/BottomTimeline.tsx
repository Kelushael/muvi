import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { colors, font, radius, fmtTime } from "../theme";
import type { Clip } from "../api";

const H = 50;
const TICKS = 8;

type Props = {
  width: number;
  duration: number;
  position: number;
  clips: Clip[];
  selectedClipId: string | null;
  onSeek: (sec: number) => void;
  onSelectClip: (clip: Clip) => void;
};

const effDur = (c: Clip) => {
  const te = c.trim_end && c.trim_end > 0 ? c.trim_end : c.duration;
  return Math.max(te - (c.trim_start || 0), 0.3);
};

export default function BottomTimeline({
  width,
  duration,
  position,
  clips,
  selectedClipId,
  onSeek,
  onSelectClip,
}: Props) {
  const safeDur = duration > 0 ? duration : 1;
  const playheadX = Math.min(Math.max((position / safeDur) * width, 0), width);

  const seekTo = (x: number) => {
    onSeek(Math.min(Math.max(x / width, 0), 1) * safeDur);
  };
  // activeOffsetX lets clip taps pass through; horizontal drag scrubs.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onBegin((e) => runOnJS(seekTo)(e.x))
    .onUpdate((e) => runOnJS(seekTo)(e.x));

  return (
    <View style={[styles.wrap, { width }]} testID="bottom-timeline">
      <GestureDetector gesture={pan}>
        <View style={[styles.track, { width }]}>
          {Array.from({ length: TICKS + 1 }).map((_, i) => (
            <View key={i} style={[styles.tick, { left: (i / TICKS) * width }]} />
          ))}
          {clips.map((c, idx) => {
            const left = Math.min((c.song_start / safeDur) * width, width - 10);
            const w = Math.max((effDur(c) / safeDur) * width, 14);
            const sel = c.id === selectedClipId;
            return (
              <Pressable
                key={c.id}
                testID={`film-clip-${c.id}`}
                onPress={() => onSelectClip(c)}
                style={[
                  styles.block,
                  {
                    left,
                    width: Math.min(w, width - left),
                    borderColor: sel ? colors.warning : "rgba(255,255,255,0.3)",
                    backgroundColor: sel ? "rgba(245,166,35,0.28)" : colors.surfaceTertiary,
                  },
                ]}
              >
                <View style={styles.sprockets}>
                  {Array.from({ length: 3 }).map((_, k) => (
                    <View key={k} style={styles.sprocket} />
                  ))}
                </View>
                <Text style={styles.blockNum}>{idx + 1}</Text>
              </Pressable>
            );
          })}
          <View pointerEvents="none" style={[styles.playhead, { left: playheadX }]} />
        </View>
      </GestureDetector>
      <View style={styles.timeRow}>
        <Text style={styles.timeTxt}>0:00</Text>
        <Text style={styles.hintTxt}>
          {clips.length ? "Tap a clip to trim · drag to scrub" : "Your clips show up here"}
        </Text>
        <Text style={styles.timeTxt}>{fmtTime(safeDur)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  track: {
    height: H,
    backgroundColor: "rgba(13,14,18,0.65)",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  block: {
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sprockets: {
    position: "absolute",
    top: 2,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    opacity: 0.5,
  },
  sprocket: { width: 3, height: 3, borderRadius: 1, backgroundColor: colors.onSurface },
  blockNum: { color: colors.onSurface, fontFamily: font.display, fontSize: 14 },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.brandPrimary,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  timeTxt: { color: colors.info, fontFamily: font.display, fontSize: 11, letterSpacing: 0.5 },
  hintTxt: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: 11 },
});
