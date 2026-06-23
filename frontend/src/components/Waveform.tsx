import React, { useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { colors, font, radius, fmtTime } from "../theme";
import type { Clip } from "../api";

const BAR_COUNT = 80;
const WAVE_H = 54;
const LANE_H = 30;

type Props = {
  width: number;
  duration: number;
  position: number;
  clips: Clip[];
  selectedClipId: string | null;
  onSeek: (sec: number) => void;
  onSelectClip: (clip: Clip) => void;
  onClipMenu: (clip: Clip) => void;
};

export default function Waveform({
  width,
  duration,
  position,
  clips,
  selectedClipId,
  onSeek,
  onSelectClip,
  onClipMenu,
}: Props) {
  const safeDur = duration > 0 ? duration : 1;
  const trackW = width;

  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => {
        const v = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37) + Math.sin(i * 0.11));
        return 0.18 + Math.min(0.82, v * 0.62);
      }),
    [],
  );

  const playheadX = Math.min(Math.max((position / safeDur) * trackW, 0), trackW);
  const lastTap = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  const seekTo = (x: number) => {
    const ratio = Math.min(Math.max(x / trackW, 0), 1);
    onSeek(ratio * safeDur);
  };
  const hapticSel = () => Haptics.selectionAsync();

  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(hapticSel)();
      runOnJS(seekTo)(e.x);
    })
    .onUpdate((e) => runOnJS(seekTo)(e.x));
  const tap = Gesture.Tap().onEnd((e) => runOnJS(seekTo)(e.x));
  const gesture = Gesture.Race(pan, tap);

  const handleClipPress = (clip: Clip) => {
    const now = Date.now();
    if (lastTap.current.id === clip.id && now - lastTap.current.t < 280) {
      lastTap.current = { id: "", t: 0 };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClipMenu(clip);
    } else {
      lastTap.current = { id: clip.id, t: now };
      onSelectClip(clip);
    }
  };

  return (
    <View style={[styles.wrap, { width }]} testID="waveform-timeline">
      {/* Waveform bars (scrub area) */}
      <GestureDetector gesture={gesture}>
        <View style={[styles.waveArea, { width }]} testID="waveform-scrub-area">
          {bars.map((h, i) => {
            const barX = (i / BAR_COUNT) * trackW;
            const passed = barX <= playheadX;
            return (
              <View
                key={i}
                style={{
                  width: trackW / BAR_COUNT - 1.5,
                  height: WAVE_H * h,
                  borderRadius: 2,
                  backgroundColor: passed ? colors.brandPrimary : colors.borderStrong,
                  opacity: passed ? 0.95 : 0.55,
                }}
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* Clip lane */}
      <View style={[styles.lane, { width }]} testID="clip-lane">
        {clips.map((c) => {
          const left = Math.min((c.song_start / safeDur) * trackW, trackW - 18);
          const w = Math.max((Math.max(c.duration, 0.4) / safeDur) * trackW, 16);
          const selected = c.id === selectedClipId;
          return (
            <Pressable
              key={c.id}
              testID={`clip-chip-${c.id}`}
              onPress={() => handleClipPress(c)}
              style={[
                styles.chip,
                {
                  left,
                  width: Math.min(w, trackW - left),
                  borderColor: selected ? colors.brandPrimary : colors.brandTertiary,
                  backgroundColor: selected ? colors.brandPrimary : colors.brandTertiary,
                },
              ]}
            >
              <View style={styles.chipDot} />
            </Pressable>
          );
        })}
      </View>

      {/* Playhead door */}
      <View pointerEvents="none" style={[styles.playhead, { left: playheadX }]}>
        <View style={styles.playheadKnob}>
          <Text style={styles.playheadTime}>{fmtTime(position)}</Text>
        </View>
        <View style={styles.playheadLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WAVE_H + LANE_H + 4,
    justifyContent: "flex-start",
  },
  waveArea: {
    height: WAVE_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lane: {
    height: LANE_H,
    marginTop: 4,
  },
  chip: {
    position: "absolute",
    top: 6,
    height: 18,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.onBrandPrimary,
  },
  playhead: {
    position: "absolute",
    top: -14,
    bottom: 0,
    width: 2,
    alignItems: "center",
  },
  playheadLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.brandPrimary,
  },
  playheadKnob: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 1,
  },
  playheadTime: {
    color: colors.onBrandPrimary,
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
