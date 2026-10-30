import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
  type PressableProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// The scale transform and the caller's style have to live on the SAME element.
// With the style on an inner wrapper, layout styles (flex, width, alignSelf)
// applied to a child of a shrink-wrapped Pressable, so `flex: 1` buttons never
// shared their row and their labels overflowed the box.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One motion vocabulary for the whole app, on React Native's built-in
 * Animated — no Reanimated dependency, so this still runs in Expo Go.
 *
 * The rule everywhere below: things that move should decelerate. Content
 * enters on `emphasized` (a long tail, so it reads as settling rather than
 * stopping) and reacts to touch on `standard`.
 */

export const duration = {
  /** Press feedback — must beat the finger leaving the screen. */
  instant: 110,
  fast: 180,
  base: 260,
  slow: 420,
  /** Rings, bars and counters filling from zero. */
  sweep: 950,
} as const;

export const easing = {
  /** Decelerate hard: fast start, long settle. For anything entering. */
  emphasized: Easing.bezier(0.16, 1, 0.3, 1),
  /** Symmetric, for state that changes in place. */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  out: Easing.out(Easing.cubic),
} as const;

/** A spring with no visible wobble — for scale and pop-in. */
export const spring = { tension: 180, friction: 14, useNativeDriver: true } as const;

/** Stagger step for lists: long enough to read as a cascade, short enough not to drag. */
export const STAGGER_MS = 55;

/** Cap the cascade so item 40 does not wait two seconds to appear. */
const MAX_STAGGER_STEPS = 8;

export function staggerDelay(index: number): number {
  return Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS;
}

/**
 * 0 → 1 entrance driver. Returns the raw value so callers can interpolate
 * whatever they need (translate, scale, opacity) off a single timeline.
 */
export function useEntrance(delay = 0, enabled = true): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: duration.slow,
      delay,
      easing: easing.emphasized,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [value, delay, enabled]);
  return value;
}

/**
 * Fades and lifts its children into place once, on mount.
 * `index` is the shorthand for list stagger: <FadeIn index={i}> per row.
 */
export function FadeIn({
  children,
  delay,
  index = 0,
  offset = 14,
  style,
}: {
  children: ReactNode;
  delay?: number;
  index?: number;
  /** Distance travelled, px. Negative slides down from above. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useEntrance(delay ?? staggerDelay(index));
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Scales in from 92% as it fades — for cards and badges that should "arrive". */
export function PopIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useEntrance(delay);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

type PressableScaleProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it sinks. 0.97 for cards, 0.93 for small round buttons. */
  scaleTo?: number;
  /** Fire a haptic tick on press. Reserve for committing actions. */
  haptic?: boolean;
};

/**
 * Press feedback that springs back instead of snapping. `Pressable`'s own
 * `style({pressed})` re-renders on every touch; this animates the transform
 * on the native driver, so it stays smooth while a list is scrolling.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number) => Animated.spring(scale, { toValue: value, ...spring }).start();

  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        // Haptics are a no-op on web and on Androids without a motor; never
        // let a missing vibrator swallow the actual press.
        if (haptic && Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A number that counts up to `value` instead of snapping to it. Re-runs from
 * the previous number whenever the target changes, so logging a meal animates
 * the delta rather than restarting from zero.
 */
export function Counter({
  value,
  style,
  format = (n) => String(n),
  delay = 0,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: (n: number) => string;
  delay?: number;
}) {
  const driver = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const sub = driver.addListener(({ value: v }) => setShown(Math.round(v)));
    const anim = Animated.timing(driver, {
      toValue: value,
      duration: duration.sweep,
      delay,
      easing: easing.emphasized,
      useNativeDriver: false, // a JS listener is the whole point here
    });
    anim.start();
    return () => {
      anim.stop();
      driver.removeListener(sub);
    };
  }, [value, delay, driver]);

  return <Text style={style}>{format(shown)}</Text>;
}

/**
 * Looping pulse for "the app is thinking" affordances. Returns an opacity
 * value; callers decide what to attach it to.
 */
export function usePulse(min = 0.45, max = 1, ms = 700): Animated.Value {
  const value = useRef(new Animated.Value(min)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: max,
          duration: ms,
          easing: easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: min,
          duration: ms,
          easing: easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, min, max, ms]);
  return value;
}

/** Slow rotation, for scanning/processing states. */
export function useSpin(ms = 2400): Animated.AnimatedInterpolation<string> {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: ms,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, ms]);
  return value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
}

/**
 * Horizontal progress bar that grows from 0 to `progress` (0-1).
 * Width percentages cannot use the native driver, hence the JS timeline.
 */
export function ProgressBar({
  progress,
  height = 8,
  color,
  trackColor,
  delay = 0,
  style,
}: {
  progress: number;
  height?: number;
  color: string;
  trackColor: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(progress, 1));

  useEffect(() => {
    const anim = Animated.timing(fill, {
      toValue: target,
      duration: duration.sweep,
      delay,
      easing: easing.emphasized,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [target, delay, fill]);

  return (
    <View
      style={[
        { height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}
