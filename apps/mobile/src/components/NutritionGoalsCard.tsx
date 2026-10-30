import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { NutritionGoals } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { Card } from './Card';
import { progress, remaining } from './nutritionMeter';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 132;
const STROKE = 13;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP_MS = 1100;

type Totals = { calories: number; protein: number; carbs: number; fat: number };

const EMPTY: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function NutritionGoalsCard({
  goals,
  consumed = EMPTY,
}: {
  goals: NutritionGoals;
  consumed?: Totals;
}) {
  const left = remaining(consumed.calories, goals.calories);
  const macros = [
    { key: 'Carbs', eaten: consumed.carbs, goal: goals.carbs, opacity: 1 },
    { key: 'Protein', eaten: consumed.protein, goal: goals.protein, opacity: 0.72 },
    { key: 'Fat', eaten: consumed.fat, goal: goals.fat, opacity: 0.45 },
  ];

  return (
    <Card style={{ padding: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <Text style={[type.sectionHeader, { flex: 1 }]}>Daily nutrition goals</Text>
        <Text style={type.caption}>Today</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        <CalorieRing consumed={consumed.calories} goal={goals.calories} />
        <View style={{ flex: 1, gap: 14 }}>
          {macros.map((m, i) => (
            <MacroBar
              key={m.key}
              label={m.key}
              eaten={m.eaten}
              goal={m.goal}
              opacity={m.opacity}
              delay={220 + i * 110}
            />
          ))}
        </View>
      </View>

      <Text style={[type.caption, { marginTop: 16 }]}>
        {left >= 0
          ? `${left} cal left of your ${goals.calories} cal target`
          : `${Math.abs(left)} cal over your ${goals.calories} cal target`}
      </Text>
    </Card>
  );
}

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const [count, setCount] = useState(0);
  const target = progress(consumed, goal);

  // The ring fills and the number counts up off the same driver, so they
  // always land together. strokeDashoffset cannot use the native driver.
  useEffect(() => {
    // The driver runs 0 → target (consumed/goal), so the count is the share
    // of the sweep done times consumed. `value * consumed` landed on
    // consumed²/goal: 990 eaten of 1816 showed as 540.
    if (target === 0) {
      setCount(Math.round(consumed));
    }
    const sub = sweep.addListener(({ value }) =>
      setCount(target > 0 ? Math.round((value / target) * consumed) : Math.round(consumed)),
    );
    Animated.timing(sweep, {
      toValue: target,
      duration: SWEEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      sweep.removeListener(sub);
    };
  }, [consumed, target, sweep]);

  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFA872" />
            <Stop offset="1" stopColor={colors.primary} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke={colors.primaryLight}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke="url(#ring)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={sweep.interpolate({
            inputRange: [0, 1],
            outputRange: [CIRCUMFERENCE, 0],
          })}
          // Start the sweep at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 30,
          letterSpacing: -0.8,
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
        }}
      >
        {count}
      </Text>
      <Text style={[type.caption, { marginTop: -2 }]}>of {goal} cal</Text>
    </View>
  );
}

function MacroBar({
  label,
  eaten,
  goal,
  opacity,
  delay,
}: {
  label: string;
  eaten: number;
  goal: number;
  opacity: number;
  delay: number;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const target = progress(eaten, goal);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: target,
      duration: SWEEP_MS - 200,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating width %, not a transform
    }).start();
  }, [target, delay, fill]);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[type.caption, { flex: 1, color: colors.textSecondary }]}>{label}</Text>
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: 14,
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {eaten}
        </Text>
        <Text style={[type.caption, { fontSize: 11.5 }]}> / {goal}g</Text>
      </View>
      <View
        style={{
          height: 7,
          borderRadius: radii.pill,
          backgroundColor: colors.primaryLight,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            borderRadius: radii.pill,
            backgroundColor: colors.primary,
            opacity,
            width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>
    </View>
  );
}
