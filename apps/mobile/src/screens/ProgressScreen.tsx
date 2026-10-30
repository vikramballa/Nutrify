import { useState } from 'react';
import { ScrollView, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, type } from '../theme/typography';
import { Counter, FadeIn, PressableScale, ProgressBar } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { CoachCard } from '../components/CoachCard';
import { ErrorState } from '../components/States';
import { CalorieBarChart } from '../components/CalorieBarChart';
import { WeightLineChart } from '../components/WeightLineChart';
import { SmartTargetsCard } from '../components/SmartTargetsCard';
import { useProfile } from '../hooks/useProfile';
import { useTodayLogs, useDeleteLog } from '../hooks/useLogs';
import { useProgressSummary, useUpsertWeight, useWeightHistory } from '../hooks/useTracking';

const MACROS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const;

const MEAL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

export function ProgressScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useProfile();
  const today = useTodayLogs();
  const deleteLog = useDeleteLog();
  const summary = useProgressSummary(7);
  const weight = useWeightHistory(30);
  const upsertWeight = useUpsertWeight();
  const [kgInput, setKgInput] = useState('');

  // No fake goals: render a loading/empty state until real goals arrive.
  const goals = profile.data?.goals ?? null;
  const totals = today.data?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const logs = today.data?.logs ?? [];

  const entries = weight.data ?? [];
  const latestKg = entries.length > 0 ? entries[entries.length - 1].kg : null;
  const kg = parseFloat(kgInput);
  const kgValid = !Number.isNaN(kg) && kg >= 20 && kg <= 400;

  const logWeight = () => {
    if (!kgValid) return;
    upsertWeight.mutate({ kg }, { onSuccess: () => setKgInput('') });
  };

  return (
    <Screen>
      <ScrollView
        // The keyboard otherwise covers the lower fields and the save button.
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: SCREEN_PADDING, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <Text style={type.screenTitle}>Today's Progress</Text>
        </FadeIn>

        <CoachCard hasLogs={logs.length > 0} />

        {today.isError ? (
          <ErrorState onRetry={() => today.refetch()} />
        ) : goals == null ? (
          <Card style={{ padding: 24, alignItems: 'center' }}>
            {profile.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Set up your profile to see daily nutrition goals.
              </Text>
            )}
          </Card>
        ) : (
          <Card style={{ padding: 20, gap: 18 }}>
            <Text style={type.sectionHeader}>Nutrition</Text>
            {MACROS.map((m, i) => {
              const goal = goals[m.key];
              const consumed = totals[m.key];
              const over = consumed > goal;
              return (
                <View key={m.key} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]}>{m.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Counter
                        value={consumed}
                        delay={i * 90}
                        style={[type.caption, over && { color: colors.danger }]}
                        format={(n) => `${n}${m.unit}`}
                      />
                      <Text style={[type.caption, over && { color: colors.danger }]}>
                        {' '}
                        / {goal}
                        {m.unit}
                      </Text>
                    </View>
                  </View>
                  <ProgressBar
                    progress={goal > 0 ? consumed / goal : 0}
                    height={10}
                    delay={i * 90}
                    color={over ? colors.danger : colors.primary}
                    trackColor={colors.primaryLight}
                  />
                </View>
              );
            })}
          </Card>
        )}

        <Card style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.sectionHeader}>This Week</Text>
            {goals != null && <Text style={type.caption}>Goal {goals.calories} cal/day</Text>}
          </View>
          {summary.isError ? (
            <ErrorState onRetry={() => summary.refetch()} />
          ) : summary.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <CalorieBarChart days={summary.data?.days ?? []} goal={goals?.calories ?? null} />
          )}
        </Card>

        <Card style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.sectionHeader}>Weight</Text>
            {latestKg != null && <Text style={type.caption}>{latestKg} kg</Text>}
          </View>
          {weight.isError ? (
            <ErrorState onRetry={() => weight.refetch()} />
          ) : weight.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : entries.length === 0 ? (
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              No weigh-ins yet. Log your first one below.
            </Text>
          ) : (
            <WeightLineChart entries={entries} />
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={kgInput}
              onChangeText={setKgInput}
              placeholder="Today's weight (kg)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              onSubmitEditing={logWeight}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                fontFamily: fonts.regular,
                fontSize: 15,
                color: colors.textPrimary,
              }}
            />
            <PressableScale
              onPress={logWeight}
              haptic
              scaleTo={0.94}
              disabled={!kgValid || upsertWeight.isPending}
              style={{
                height: 46,
                paddingHorizontal: 20,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: kgValid ? colors.primary : colors.primaryLight,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.semibold,
                  fontSize: 14,
                  color: kgValid ? colors.surface : colors.primary,
                }}
              >
                Log
              </Text>
            </PressableScale>
          </View>
        </Card>

        <SmartTargetsCard enabled={profile.data?.profile != null} />

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={type.sectionHeader}>Today's Meals</Text>
            <PressableScale
              onPress={() => nav.navigate('LogMeal')}
              scaleTo={0.94}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              hitSlop={8}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>
                Log a meal
              </Text>
            </PressableScale>
          </View>
          {logs.length === 0 ? (
            <Card style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <Ionicons name="restaurant-outline" size={28} color={colors.textTertiary} />
              <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Nothing logged yet. Tap "Log a meal" to add what you ate, or open a
                recipe and tap "Log meal".
              </Text>
            </Card>
          ) : (
            <Card style={{ padding: 4 }}>
              {logs.map((log, i) => (
                <FadeIn key={log.id} index={i} offset={8}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderBottomWidth: i < logs.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={MEAL_ICONS[log.mealType] ?? 'restaurant-outline'}
                      size={20}
                      color={colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={type.caption}>
                        {log.mealType[0].toUpperCase() + log.mealType.slice(1)}
                      </Text>
                      <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={1}>
                        {log.name}
                      </Text>
                    </View>
                    <Text style={type.caption}>{log.calories} cal</Text>
                    <PressableScale
                      onPress={() => deleteLog.mutate(log.id)}
                      scaleTo={0.85}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${log.name}`}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={20}
                        color={colors.textTertiary}
                      />
                    </PressableScale>
                  </View>
                </FadeIn>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
