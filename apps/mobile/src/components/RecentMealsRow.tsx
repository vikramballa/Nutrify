import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecentMeal } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { fonts, radii, type } from '../theme/typography';
import { FadeIn, PressableScale } from '../theme/motion';
import { currentMealType } from '../hooks/useLogs';
import { useRecentMeals, useRepeatMeal } from '../hooks/useStreak';

/**
 * People eat the same fifteen things. Making yesterday's lunch a single tap
 * removes the search-and-scroll that stops most days from being logged at all.
 */
function MealChip({ meal, onLog, done }: { meal: RecentMeal; onLog: () => void; done: boolean }) {
  return (
    <PressableScale
      onPress={onLog}
      haptic
      disabled={done}
      scaleTo={0.94}
      style={[styles.chip, done && styles.chipDone]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${meal.name} again, ${meal.calories} calories`}
    >
      <View style={[styles.chipIcon, done && styles.chipIconDone]}>
        <Ionicons
          name={done ? 'checkmark' : 'add'}
          size={16}
          color={done ? '#FFFFFF' : colors.primary}
        />
      </View>
      <View style={styles.chipText}>
        <Text style={styles.chipName} numberOfLines={1}>
          {meal.name}
        </Text>
        <Text style={styles.chipMacros}>{meal.calories} cal</Text>
      </View>
    </PressableScale>
  );
}

export function RecentMealsRow() {
  const recent = useRecentMeals();
  const repeat = useRepeatMeal();
  // Local, not derived from the query: the row should confirm the tap
  // instantly and stay confirmed even after the list refetches.
  const [logged, setLogged] = useState<Set<string>>(new Set());

  const meals = recent.data?.meals ?? [];
  if (meals.length === 0) return null;

  function logAgain(meal: RecentMeal) {
    setLogged((prev) => new Set(prev).add(meal.logId));
    repeat.mutate(
      { logId: meal.logId, mealType: currentMealType() },
      {
        onError: () =>
          setLogged((prev) => {
            const next = new Set(prev);
            next.delete(meal.logId);
            return next;
          }),
      },
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={type.sectionHeader}>Log again</Text>
        <Text style={type.caption}>One tap</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={meals}
        keyExtractor={(m) => m.logId}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item, index }) => (
          <FadeIn index={index} offset={0}>
            <MealChip
              meal={item}
              done={logged.has(item.logId)}
              onLog={() => logAgain(item)}
            />
          </FadeIn>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 11 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  gap: { width: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 210,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chipDone: { borderColor: colors.primaryLight, backgroundColor: colors.primarySoft },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIconDone: { backgroundColor: colors.primary },
  chipText: { flexShrink: 1 },
  chipName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  chipMacros: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary },
});
