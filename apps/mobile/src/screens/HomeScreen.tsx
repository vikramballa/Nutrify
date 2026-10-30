import { Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, radii, SCREEN_PADDING, type } from '../theme/typography';
import { Counter, FadeIn, PressableScale } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Skeleton } from '../components/Skeleton';
import { NutritionGoalsCard } from '../components/NutritionGoalsCard';
import { StreakCard } from '../components/StreakCard';
import { RecentMealsRow } from '../components/RecentMealsRow';
import { WaterCard } from '../components/WaterCard';
import { MealSuggestionCard } from '../components/MealSuggestionCard';
import { ErrorState } from '../components/States';
import { useProfile } from '../hooks/useProfile';
import { useTodayLogs } from '../hooks/useLogs';
import { useDislikeRecipe, useRecommendedRecipes } from '../hooks/useRecipes';
import { useStreak } from '../hooks/useStreak';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `Good ${part}, ${name}!`;
}

const QUICK_ACTIONS = [
  {
    label: 'Pantry',
    hint: 'Cook what you have',
    icon: 'basket-outline' as const,
    route: 'Pantry' as const,
  },
  {
    label: 'Meal Plan',
    hint: 'Plan your week',
    icon: 'calendar-outline' as const,
    route: 'MealPlan' as const,
  },
  {
    label: 'Progress',
    hint: 'Charts and coach',
    icon: 'stats-chart-outline' as const,
    route: 'Progress' as const,
  },
  {
    label: 'Saved',
    hint: 'Your favourites',
    icon: 'heart-outline' as const,
    route: 'Saved' as const,
  },
];

export function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { logout } = useAuth();
  const profile = useProfile();
  const suggestions = useRecommendedRecipes(5);
  const logs = useTodayLogs();
  const streak = useStreak();
  const dislike = useDislikeRecipe();

  const name = profile.data?.name.trim().split(/\s+/)[0] ?? 'there';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const metrics = profile.data?.metrics;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn style={styles.headerRow}>
          <View style={styles.flex1}>
            <Text style={type.screenTitle}>{greeting(name)}</Text>
            <Text style={[type.caption, styles.captionTop]}>{today}</Text>
          </View>
          <PressableScale
            onPress={() => nav.navigate('Settings')}
            scaleTo={0.88}
            hitSlop={10}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </PressableScale>
          <PressableScale
            // One stray tap beside Settings used to end the session outright.
            onPress={() =>
              Alert.alert('Log out?', 'You will need your password to sign back in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log out', style: 'destructive', onPress: () => void logout() },
              ])
            }
            scaleTo={0.88}
            hitSlop={10}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
          </PressableScale>
        </FadeIn>

        <FadeIn delay={40}>
          <StreakCard streak={streak.data} loading={streak.isLoading} />
        </FadeIn>

        {metrics && (
          <FadeIn delay={60}>
            <Card style={styles.cardPadding}>
              <Text style={[type.sectionHeader, styles.sectionHeaderSpaced]}>Health Snapshot</Text>
              <View style={styles.statsRow}>
                <Stat
                  value={metrics.bmi}
                  label={`BMI · ${metrics.bmiCategory}`}
                  decimals
                  delay={200}
                />
                <Stat value={metrics.bodyFatPct} label="Body fat (est.)" suffix="%" delay={280} />
                <Stat value={metrics.tdee} label="Daily burn (cal)" delay={360} />
              </View>
            </Card>
          </FadeIn>
        )}

        <FadeIn delay={110}>
          {profile.isError ? (
            <ErrorState onRetry={() => profile.refetch()} />
          ) : profile.data ? (
            <NutritionGoalsCard goals={profile.data.goals} consumed={logs.data?.totals} />
          ) : (
            <Skeleton width="100%" height={120} borderRadius={20} />
          )}
          {/* Typed logging is the most frequent action in the app; it was
              only reachable from inside Progress. */}
          <PressableScale
            onPress={() => nav.navigate('LogMeal')}
            haptic
            style={styles.logButton}
            accessibilityRole="button"
            accessibilityLabel="Log what you ate"
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.logButtonText}>Log what you ate</Text>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={160}>
          <WaterCard />
        </FadeIn>

        <FadeIn delay={190}>
          <RecentMealsRow />
        </FadeIn>

        <View style={styles.quickActionsGrid}>
          {QUICK_ACTIONS.map((a, i) => (
            <FadeIn key={a.label} delay={210 + i * 55} style={styles.quickActionSlot}>
              <PressableScale
                onPress={() => nav.navigate(a.route)}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`${a.label}, ${a.hint}`}
              >
                <Card style={styles.quickActionCard}>
                  <View style={styles.quickActionIcon}>
                    <Ionicons name={a.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[type.cardTitle, styles.quickActionLabel]} numberOfLines={1}>
                      {a.label}
                    </Text>
                    <Text style={[type.caption, styles.quickActionHint]} numberOfLines={1}>
                      {a.hint}
                    </Text>
                  </View>
                </Card>
              </PressableScale>
            </FadeIn>
          ))}
        </View>

        <FadeIn delay={440}>
          <Text style={[type.sectionHeader, styles.suggestionsHeader]}>Meal Suggestions</Text>
          {suggestions.isError ? (
            <ErrorState onRetry={() => suggestions.refetch()} />
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={suggestions.data?.recipes ?? []}
              keyExtractor={(r) => r.id}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item, index }) => (
                <FadeIn index={index} offset={0}>
                  <MealSuggestionCard
                    recipe={item}
                    reasons={suggestions.data?.reasons?.[item.id] ?? []}
                    onPress={() => nav.navigate('RecipeDetail', { recipe: item })}
                    onDismiss={() => dislike.mutate(item.id)}
                  />
                </FadeIn>
              )}
              ListEmptyComponent={
                suggestions.isLoading ? (
                  <View style={styles.skeletonRow}>
                    {[0, 1].map((i) => (
                      <Skeleton key={i} width={260} height={210} borderRadius={20} />
                    ))}
                  </View>
                ) : null
              }
            />
          )}
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

/** One health number, counting up to its value on first paint. */
function Stat({
  value,
  label,
  suffix = '',
  decimals = false,
  delay,
}: {
  value: number;
  label: string;
  suffix?: string;
  /** BMI is the only one whose fraction matters. */
  decimals?: boolean;
  delay: number;
}) {
  return (
    <View style={styles.statItem}>
      <Counter
        // Counter rounds to integers, so a decimal value counts in tenths and
        // is divided back down for display.
        value={decimals ? Math.round(value * 10) : value}
        delay={delay}
        style={type.statNumber}
        format={(n) => (decimals ? (n / 10).toFixed(1) : `${n}${suffix}`)}
      />
      <Text style={[type.caption, styles.statLabel]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: SCREEN_PADDING, paddingBottom: 28, gap: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  flex1: { flex: 1 },
  captionTop: { marginTop: 4 },
  iconButton: { padding: 8, marginTop: 2 },
  cardPadding: { padding: 20 },
  sectionHeaderSpaced: { marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center' },
  statLabel: { marginTop: 2 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // Two per row: four across was too tight for a label plus a hint.
  quickActionSlot: { width: '47.5%', flexGrow: 1 },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 14,
    paddingHorizontal: 13,
  },
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: { fontSize: 13.5 },
  quickActionHint: { fontSize: 11, marginTop: 1 },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  logButtonText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  suggestionsHeader: { marginBottom: 12 },
  separator: { width: 14 },
  skeletonRow: { flexDirection: 'row', gap: 14 },
});
