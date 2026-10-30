import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdaptiveGoalsResponse } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { FadeIn, PressableScale, ProgressBar } from '../theme/motion';
import { Card } from './Card';
import { useAdaptiveGoals, useApplyAdaptiveGoals } from '../hooks/useProfile';

type Ready = Extract<AdaptiveGoalsResponse, { status: 'ready' }>;
type Collecting = Extract<AdaptiveGoalsResponse, { status: 'collecting' }>;

const fmt = (n: number) => n.toLocaleString('en-US');

function trendText(kgPerWeek: number): string {
  if (Math.abs(kgPerWeek) < 0.05) return 'Your weight is steady';
  const dir = kgPerWeek < 0 ? 'losing' : 'gaining';
  return `You're ${dir} ${Math.abs(kgPerWeek).toFixed(2)} kg/week`;
}

/**
 * Targets measured from the user's own intake and weight trend rather than
 * the onboarding formula. Hidden until the profile exists; shows progress
 * toward enough data before that.
 */
export function SmartTargetsCard({ enabled }: { enabled: boolean }) {
  const adaptive = useAdaptiveGoals(enabled);
  const apply = useApplyAdaptiveGoals();
  if (!enabled || adaptive.isError || !adaptive.data) return null;
  const a = adaptive.data;

  return (
    <FadeIn>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="pulse" size={18} color={colors.primary} />
          <Text style={type.sectionHeader}>Smart Targets</Text>
        </View>
        {a.status === 'collecting' ? (
          <CollectingBody a={a} />
        ) : (
          <ReadyBody a={a} applying={apply.isPending} onApply={() => apply.mutate()} />
        )}
        {apply.isError && (
          <Text style={[type.caption, { color: colors.danger }]}>
            Could not update your targets. Try again.
          </Text>
        )}
      </Card>
    </FadeIn>
  );
}

// A met requirement reads "Done", not "7 / 3".
const tally = (have: number, need: number) => (have >= need ? 'Done' : `${have} / ${need}`);

function CollectingBody({ a }: { a: Collecting }) {
  const rows = [
    {
      label: 'Fully logged days',
      value: tally(a.loggedDays, a.requiredLoggedDays),
      progress: a.loggedDays / a.requiredLoggedDays,
    },
    {
      label: 'Weigh-ins',
      value: tally(a.weighIns, a.requiredWeighIns),
      progress: a.weighIns / a.requiredWeighIns,
    },
    {
      label: 'Days between first and last weigh-in',
      value: tally(a.weighInSpanDays, a.requiredSpanDays),
      progress: a.weighInSpanDays / a.requiredSpanDays,
    },
  ];
  return (
    <>
      <Text style={type.caption}>
        Log your meals and weigh in a few times, and NutriChef will measure what your body really
        burns, then tune your calorie target to it.
      </Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <View style={styles.rowLabel}>
            <Text style={type.caption}>{r.label}</Text>
            <Text style={[type.caption, styles.bold]}>{r.value}</Text>
          </View>
          <ProgressBar
            progress={Math.min(1, r.progress)}
            height={6}
            color={colors.primary}
            trackColor={colors.primaryLight}
          />
        </View>
      ))}
    </>
  );
}

function ReadyBody({
  a,
  applying,
  onApply,
}: {
  a: Ready;
  applying: boolean;
  onApply: () => void;
}) {
  return (
    <>
      <Text style={type.body}>
        {trendText(a.weeklyChangeKg)} on about {fmt(a.avgIntake)} cal/day, so your body burns
        roughly <Text style={styles.bold}>{fmt(a.estimatedTdee)} cal/day</Text>
        {Math.abs(a.estimatedTdee - a.formulaTdee) >= 100
          ? ` (the formula guessed ${fmt(a.formulaTdee)}).`
          : '.'}
      </Text>
      {a.changed ? (
        <>
          <View style={styles.compare}>
            <Stat label="Now" value={a.current.calories} />
            <Ionicons name="arrow-forward" size={18} color={colors.textTertiary} />
            <Stat label="Suggested" value={a.suggested.calories} highlight />
          </View>
          <Text style={type.caption}>
            Protein {a.suggested.protein} g · Carbs {a.suggested.carbs} g · Fat {a.suggested.fat} g.
            Changes are capped at 300 cal at a time.
          </Text>
          <PressableScale onPress={onApply} haptic disabled={applying} style={styles.button}>
            {applying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonLabel}>Use {fmt(a.suggested.calories)} cal/day</Text>
            )}
          </PressableScale>
        </>
      ) : (
        <View style={styles.onTrack}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[type.caption, { color: colors.success, flex: 1 }]}>
            Your current target already matches your results.
          </Text>
        </View>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.statNumber, highlight && { color: colors.primary }]}>{fmt(value)}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bold: { fontFamily: fonts.semibold },
  row: { gap: 6 },
  rowLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  compare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  stat: { alignItems: 'center' },
  button: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  onTrack: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
