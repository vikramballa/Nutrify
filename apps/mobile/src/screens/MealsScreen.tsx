import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { parseMealText, type CustomLogItem, type MealLog, type MealType } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { FadeIn, PressableScale } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { ErrorState } from '../components/States';
import {
  todayKey,
  useDayLogs,
  useDeleteLog,
  useLogPreview,
  useUpdateLog,
} from '../hooks/useLogs';
import { MEAL_ICONS, MEAL_LABELS, MEAL_TYPES, mealLabel } from '../lib/meals';
import type { RootStackParamList } from '../navigation/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Move a UTC day key by whole days. */
function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", else "Thu, 5 Nov" — read in UTC, the API's day boundary. */
function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Amounts offered when fixing a log, as a multiple of what was logged. */
const AMOUNTS = [0.5, 1, 1.5, 2, 3];
const amountLabel = (a: number) => (a === 0.5 ? '½×' : a === 1.5 ? '1½×' : `${a}×`);

export function MealsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Meals'>>();
  const today = todayKey();
  const [date, setDate] = useState(route.params?.date ?? today);
  const logs = useDayLogs(date);
  const [editing, setEditing] = useState<MealLog | null>(null);

  const isToday = date === today;
  const list = logs.data?.logs ?? [];
  const totals = logs.data?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const byType = useMemo(() => {
    const groups = new Map<string, MealLog[]>();
    for (const l of list) groups.set(l.mealType, [...(groups.get(l.mealType) ?? []), l]);
    return groups;
  }, [list]);

  // Today shows every slot so an empty one can be filled; a past day only
  // shows what was logged, since adding now would file it under today.
  const sections = MEAL_TYPES.filter((t) => isToday || byType.has(t));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.dayRow}>
          <PressableScale
            onPress={() => setDate((d) => shiftDay(d, -1))}
            scaleTo={0.88}
            hitSlop={8}
            style={styles.dayArrow}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </PressableScale>
          <View style={styles.dayCentre}>
            <Text style={type.sectionHeader}>{dayLabel(date, today)}</Text>
            <Text style={type.caption}>
              {list.length === 0 ? 'Nothing logged' : `${list.length} logged`}
            </Text>
          </View>
          <PressableScale
            onPress={() => setDate((d) => shiftDay(d, 1))}
            disabled={isToday}
            scaleTo={0.88}
            hitSlop={8}
            style={[styles.dayArrow, isToday && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </PressableScale>
        </View>

        <Card style={styles.totals}>
          {(
            [
              ['calories', 'Calories', ''],
              ['protein', 'Protein', 'g'],
              ['carbs', 'Carbs', 'g'],
              ['fat', 'Fat', 'g'],
            ] as const
          ).map(([k, label, unit]) => (
            <View key={k} style={styles.totalItem}>
              <Text style={type.statNumber}>
                {totals[k]}
                {unit}
              </Text>
              <Text style={type.caption}>{label}</Text>
            </View>
          ))}
        </Card>

        {logs.isError ? (
          <ErrorState onRetry={() => logs.refetch()} />
        ) : logs.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : sections.length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="restaurant-outline" size={28} color={colors.textTertiary} />
            <Text style={[type.body, styles.emptyText]}>Nothing was logged on this day.</Text>
          </Card>
        ) : (
          sections.map((mealType, si) => {
            const rows = byType.get(mealType) ?? [];
            const kcal = rows.reduce((s, r) => s + r.calories, 0);
            return (
              <FadeIn key={mealType} index={si} offset={8} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIcon}>
                    <Ionicons name={MEAL_ICONS[mealType]} size={16} color={colors.primary} />
                  </View>
                  <Text style={[type.cardTitle, styles.flex1]}>{MEAL_LABELS[mealType]}</Text>
                  {rows.length > 0 && <Text style={type.caption}>{kcal} cal</Text>}
                </View>
                <Card style={styles.sectionCard}>
                  {rows.map((log, i) => (
                    <PressableScale
                      key={log.id}
                      onPress={() => setEditing(log)}
                      scaleTo={0.98}
                      style={[styles.row, i > 0 && styles.rowDivider]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${log.name}, ${log.calories} calories`}
                    >
                      <View style={styles.flex1}>
                        <Text style={styles.rowName} numberOfLines={2}>
                          {log.name}
                        </Text>
                        <Text style={[type.caption, styles.rowMeta]}>
                          {timeOf(log.at)} · P {log.protein}g · C {log.carbs}g · F {log.fat}g
                        </Text>
                      </View>
                      <Text style={styles.rowKcal}>{log.calories}</Text>
                      <Ionicons name="create-outline" size={18} color={colors.textTertiary} />
                    </PressableScale>
                  ))}
                  {isToday && (
                    <PressableScale
                      onPress={() => nav.navigate('LogMeal', { mealType })}
                      scaleTo={0.98}
                      style={[styles.addRow, rows.length > 0 && styles.rowDivider]}
                      accessibilityRole="button"
                      accessibilityLabel={`Add to ${MEAL_LABELS[mealType]}`}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      <Text style={styles.addText}>
                        {mealType === 'beverage' ? 'Add a drink' : `Add to ${MEAL_LABELS[mealType].toLowerCase()}`}
                      </Text>
                    </PressableScale>
                  )}
                </Card>
              </FadeIn>
            );
          })
        )}
      </ScrollView>

      <EditLogSheet log={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

/** Keystrokes settle for this long before the preview asks the API. */
const PREVIEW_DEBOUNCE_MS = 500;

/**
 * Fix one log: another meal slot, another amount, or another food entirely.
 * The numbers are always the API's — an amount rescales the stored macros and
 * a new food is priced from the nutrition tables, with a live preview first.
 */
function EditLogSheet({ log, onClose }: { log: MealLog | null; onClose: () => void }) {
  const update = useUpdateLog();
  const remove = useDeleteLog();
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [amount, setAmount] = useState(1);
  const [food, setFood] = useState('');

  // Reset the form whenever a different log is opened.
  useEffect(() => {
    if (!log) return;
    setMealType((MEAL_TYPES as string[]).includes(log.mealType) ? log.mealType : 'snack');
    setAmount(1);
    setFood('');
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id]);

  const items = useMemo<CustomLogItem[]>(() => parseMealText(food), [food]);
  const [debounced, setDebounced] = useState<CustomLogItem[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(items), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [items]);
  const preview = useLogPreview(debounced);
  const unresolved = (preview.data?.items ?? []).filter((p) => !p.resolved);

  if (!log) return <BottomSheet visible={false} title="" onClose={onClose}>{null}</BottomSheet>;

  const replacing = items.length > 0;
  const newCalories = replacing
    ? debounced.length > 0
      ? preview.data?.totals.calories
      : undefined
    : Math.round(log.calories * amount);
  const changed = mealType !== log.mealType || amount !== 1 || replacing;

  function save() {
    if (!log || !changed) return;
    const name = items.map((i) => i.name).join(', ');
    update.mutate(
      {
        id: log.id,
        ...(mealType !== log.mealType ? { mealType } : {}),
        ...(replacing
          ? { items, name: name[0].toUpperCase() + name.slice(1) }
          : amount !== 1
            ? { servings: amount }
            : {}),
      },
      { onSuccess: onClose },
    );
  }

  function confirmDelete() {
    if (!log) return;
    Alert.alert(`Delete ${log.name}?`, 'It is removed from this day’s totals.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(log.id, { onSuccess: onClose }),
      },
    ]);
  }

  return (
    <BottomSheet
      visible
      title={log.name}
      subtitle={`${log.calories} cal · ${mealLabel(log.mealType)} at ${timeOf(log.at)}`}
      onClose={onClose}
    >
      <View style={styles.sheetSection}>
        <Text style={type.eyebrow}>WHICH MEAL</Text>
        <View style={styles.chipRow}>
          {MEAL_TYPES.map((m) => (
            <Chip
              key={m}
              label={MEAL_LABELS[m]}
              icon={MEAL_ICONS[m]}
              active={m === mealType}
              onPress={() => setMealType(m)}
            />
          ))}
        </View>
      </View>

      {!replacing && (
        <View style={styles.sheetSection}>
          <Text style={type.eyebrow}>HOW MUCH</Text>
          <View style={styles.chipRow}>
            {AMOUNTS.map((a) => (
              <Chip key={a} label={amountLabel(a)} active={a === amount} onPress={() => setAmount(a)} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.sheetSection}>
        <Text style={type.eyebrow}>WRONG FOOD? TYPE WHAT IT WAS</Text>
        <TextInput
          value={food}
          onChangeText={setFood}
          placeholder="e.g. 1 cup tea, 2 biscuits"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          returnKeyType="done"
        />
        {replacing && unresolved.length > 0 && (
          <Text style={[type.caption, styles.warn]}>
            Not recognised, counted as 0: {unresolved.map((u) => u.name).join(', ')}
          </Text>
        )}
      </View>

      {(update.isError || remove.isError) && (
        <Text style={styles.error}>Could not save that change. Try again.</Text>
      )}

      <View style={styles.sheetButtons}>
        <PressableScale
          onPress={confirmDelete}
          disabled={remove.isPending}
          scaleTo={0.96}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete this meal"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={styles.deleteText}>Delete</Text>
        </PressableScale>
        <PressableScale
          onPress={save}
          disabled={!changed || update.isPending}
          haptic
          scaleTo={0.97}
          style={[styles.saveButton, (!changed || update.isPending) && styles.dim]}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>
            {update.isPending
              ? 'Saving…'
              : changed && newCalories !== undefined
                ? `Save · ${newCalories} cal`
                : 'Save'}
          </Text>
        </PressableScale>
      </View>
    </BottomSheet>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textSecondary} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, paddingBottom: 40, gap: 16 },
  flex1: { flex: 1 },
  dim: { opacity: 0.35 },
  loader: { marginTop: 24 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayArrow: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCentre: { flex: 1, alignItems: 'center', gap: 2 },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  totalItem: { alignItems: 'center' },
  empty: { padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { color: colors.textSecondary, textAlign: 'center' },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: { paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.textPrimary },
  rowMeta: { marginTop: 2, fontSize: 11.5 },
  rowKcal: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  addText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.primary },
  sheetSection: { gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  input: {
    height: 46,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warn: { color: colors.highlightText },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerLight,
  },
  deleteText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
});
