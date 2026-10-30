import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { colors } from '../theme/colors';
import { fonts, type } from '../theme/typography';
import { Card } from './Card';

// LayoutAnimation is opt-in on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GREEN = '#16A34A';
const GREEN_BG = '#DCFCE7';
const GREEN_BORDER = '#BBF7D0';

// First duration mentioned in a step → seconds. "at least 30 minutes" → 1800.
function parseSeconds(text: string): number | null {
  // allow a couple of filler words between number and unit ("5 more minutes")
  const m = text.match(/(\d+)(?:\s+\w+){0,2}?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u.startsWith('h')) return n * 3600;
  if (u.startsWith('s')) return n;
  return n * 60;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Tappable countdown pill: tap to start/pause; buzzes + turns green at zero. */
function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  // Counting down from a wall-clock deadline, not decrementing per tick: iOS
  // suspends JS timers while the app is backgrounded, so a decrementing
  // timer silently stalled for as long as the phone was away.
  const [endAt, setEndAt] = useState<number | null>(null);
  const running = endAt !== null;
  const done = left === 0;
  const tag = useRef(`cook-timer-${Math.random()}`).current;

  useEffect(() => {
    if (endAt === null) return;
    // The screen dimming mid-recipe is what backgrounds the app, so keep it
    // on while a timer runs.
    activateKeepAwakeAsync(tag).catch(() => {});
    const tick = () => {
      const l = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        Vibration.vibrate(600);
        setEndAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [endAt, tag]);

  const toggle = () => {
    if (done) return setLeft(seconds); // tap when finished → reset
    setEndAt(running ? null : Date.now() + left * 1000);
  };

  const fg = done ? GREEN : colors.primary;
  const label = done ? 'Done' : running ? fmt(left) : `Start · ${fmt(left)}`;
  const icon = done ? 'checkmark-circle' : running ? 'pause' : 'timer-outline';

  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: done ? GREEN_BG : running ? colors.primaryLight : colors.background,
        borderWidth: 1,
        borderColor: done ? GREEN_BORDER : colors.border,
      }}
    >
      <Ionicons name={icon} size={15} color={fg} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: fg }}>{label}</Text>
    </Pressable>
  );
}

function Step({
  index,
  text,
  done,
  last,
  onToggle,
}: {
  index: number;
  text: string;
  done: boolean;
  last: boolean;
  onToggle: () => void;
}) {
  const anim = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: done ? 1 : 0, friction: 5, useNativeDriver: true }).start();
  }, [done]);

  const seconds = parseSeconds(text);

  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        alignItems: 'flex-start',
      }}
    >
      {/* Badge: number crossfades to a filled check that springs in. */}
      <View style={{ width: 28, height: 28 }}>
        <Animated.View
          style={[
            styles.badge,
            { borderWidth: 1.5, borderColor: colors.border },
            { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary }}>
            {index + 1}
          </Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.badge,
            { backgroundColor: GREEN },
            { opacity: anim, transform: [{ scale: anim }] },
          ]}
        >
          <Ionicons name="checkmark" size={17} color="#fff" />
        </Animated.View>
      </View>

      <View style={{ flex: 1, gap: 8, paddingTop: 3 }}>
        <Text
          style={[
            type.body,
            done && { textDecorationLine: 'line-through', color: colors.textTertiary },
          ]}
        >
          {text}
        </Text>
        {seconds != null && !done && <Timer seconds={seconds} />}
      </View>
    </Pressable>
  );
}

/** Interactive step-by-step cook mode: check off steps, run per-step timers. */
export function CookInstructions({ steps }: { steps: string[] }) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  const count = done.filter(Boolean).length;
  const allDone = count === steps.length && steps.length > 0;

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: steps.length ? count / steps.length : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [count]);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDone((d) => d.map((v, j) => (j === i ? !v : v)));
  };
  const reset = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDone(steps.map(() => false));
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.sectionHeader}>Instructions</Text>
        {count > 0 && (
          <Pressable onPress={reset} hitSlop={8}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.primary }}>
              Reset
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.primaryLight,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              height: '100%',
              borderRadius: 4,
              backgroundColor: allDone ? GREEN : colors.primary,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
        <Text style={[type.caption, allDone && { color: GREEN }]}>
          {allDone ? 'All done 🎉' : `${count}/${steps.length}`}
        </Text>
      </View>

      <Card style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
        {steps.map((s, i) => (
          <Step
            key={i}
            index={i}
            text={s}
            done={done[i]}
            last={i === steps.length - 1}
            onToggle={() => toggle(i)}
          />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
