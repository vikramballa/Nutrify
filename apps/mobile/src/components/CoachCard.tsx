import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { Counter, FadeIn, duration, easing, usePulse } from '../theme/motion';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { useWeeklyCoach } from '../hooks/useAssistant';
import { useAiConsent } from '../hooks/useAiConsent';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 62;
const STROKE = 6;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The AI review of the last seven days. Renders nothing at all when there is
 * nothing to review — an empty week should not grow a card telling you so,
 * the Progress screen already says that louder.
 */
export function CoachCard({ hasLogs }: { hasLogs: boolean }) {
  // The review sends the week's logs and profile to the AI provider, so it
  // stays hidden until the user has allowed that (Settings → AI features).
  const { granted } = useAiConsent();
  const coach = useWeeklyCoach(hasLogs && granted);

  if (!hasLogs || !granted) return null;
  if (coach.isLoading) return <CoachSkeleton />;
  // 422 (not enough data) and a dead model are both "nothing useful to show".
  if (coach.isError || !coach.data) return null;

  const { headline, summary, score, wins, tips } = coach.data;

  return (
    <FadeIn>
      <Card style={styles.card}>
        <View style={styles.header}>
          <ScoreRing score={score} />
          <View style={styles.flex1}>
            <View style={styles.titleRow}>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={type.eyebrow}>YOUR WEEK</Text>
            </View>
            <Text style={[type.sectionHeader, styles.headline]}>{headline}</Text>
          </View>
        </View>

        <Text style={type.body}>{summary}</Text>

        {wins.length > 0 && (
          <View style={styles.wins}>
            {wins.map((win, i) => (
              <FadeIn key={win} index={i} offset={6}>
                <View style={styles.winRow}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                  <Text style={[type.caption, styles.flex1]}>{win}</Text>
                </View>
              </FadeIn>
            ))}
          </View>
        )}

        {tips.length > 0 && (
          <View style={styles.tips}>
            <Text style={type.eyebrow}>WHAT TO CHANGE</Text>
            {tips.map((tip, i) => (
              <FadeIn key={tip.title} index={i} offset={8}>
                <View style={styles.tipRow}>
                  <View style={styles.tipNumber}>
                    <Text style={styles.tipNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    <Text style={[type.caption, styles.tipDetail]}>{tip.detail}</Text>
                  </View>
                </View>
              </FadeIn>
            ))}
          </View>
        )}
      </Card>
    </FadeIn>
  );
}

/** Adherence 0-100 as a ring that sweeps up alongside the number. */
function ScoreRing({ score }: { score: number }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(sweep, {
      toValue: score / 100,
      duration: duration.sweep,
      easing: easing.emphasized,
      useNativeDriver: false, // strokeDashoffset is not a native-driver prop
    });
    anim.start();
    return () => anim.stop();
  }, [score, sweep]);

  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="coachRing" x1="0" y1="0" x2="1" y2="1">
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
          stroke="url(#coachRing)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={sweep.interpolate({
            inputRange: [0, 1],
            outputRange: [CIRCUMFERENCE, 0],
          })}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Counter value={score} style={styles.ringNumber} />
    </View>
  );
}

/** Placeholder shaped like the real card, pulsing while the model thinks. */
function CoachSkeleton() {
  const opacity = usePulse(0.6, 1, 800);
  return (
    <Card style={styles.card}>
      <Animated.View style={[styles.header, { opacity }]}>
        <View style={[styles.ring, styles.ringPlaceholder]}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={type.eyebrow}>YOUR WEEK</Text>
          <Text style={[type.caption, styles.thinking]}>Reviewing your last seven days…</Text>
        </View>
      </Animated.View>
      <View style={styles.skeletonLines}>
        {[1, 0.92, 0.7].map((w, i) => (
          <Skeleton key={i} width={`${w * 100}%`} height={11} borderRadius={6} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 16 },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headline: { marginTop: 3 },

  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringPlaceholder: {
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
  },
  ringNumber: {
    fontFamily: fonts.bold,
    fontSize: 19,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  thinking: { marginTop: 3 },
  skeletonLines: { gap: 8 },

  wins: { gap: 8 },
  winRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },

  tips: { gap: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  tipNumber: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tipNumberText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryDark },
  tipTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary },
  tipDetail: { marginTop: 2, lineHeight: 18 },
});
