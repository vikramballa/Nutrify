import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MealPlanEntry, MealPlanSlot, Recipe } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, type } from '../theme/typography';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { EmptyState, ErrorState } from '../components/States';
import { useFavorites } from '../hooks/useFavorites';
import {
  dayKey,
  mondayOf,
  shiftWeek,
  useAddMealPlanEntry,
  useAutoFillWeek,
  useMealPlan,
  useMealPlanToGrocery,
  useRemoveMealPlanEntry,
} from '../hooks/useMealPlan';
import { useProfile } from '../hooks/useProfile';
import { useRecipeSearch } from '../hooks/useRecipes';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS: MealPlanSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_ICONS: Record<MealPlanSlot, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};
const SLOT_LABELS: Record<MealPlanSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function formatRange(weekStart: string, weekEnd: string): string {
  const fmt = (k: string) =>
    new Date(`${k}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

export function MealPlanScreen() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const week = dayKey(monday);
  const isThisWeek = week === dayKey(mondayOf(new Date()));

  const plan = useMealPlan(week);
  const add = useAddMealPlanEntry(week);
  const remove = useRemoveMealPlanEntry(week);
  const autoFill = useAutoFillWeek(week);
  const toGrocery = useMealPlanToGrocery(week);
  const profile = useProfile();
  const goalCal = profile.data?.goals.calories;

  const [picker, setPicker] = useState<{ date: string; slot: MealPlanSlot } | null>(null);

  const data = plan.data;
  const days = useMemo(
    () =>
      data?.days ??
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return { date: dayKey(d), calories: 0, protein: 0, carbs: 0, fat: 0 };
      }),
    [data, monday],
  );
  const entries = data?.entries ?? [];

  const confirmAutoFill = () =>
    Alert.alert('Auto-fill week', 'Fill empty breakfast, lunch and dinner slots with picks for you?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Fill',
        onPress: () =>
          autoFill.mutate(undefined, {
            onError: () => Alert.alert('Auto-fill failed', 'Please try again.'),
          }),
      },
    ]);

  const confirmGrocery = () =>
    Alert.alert('Add to grocery list', 'Add this week\'s missing ingredients to your grocery list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () =>
          toGrocery.mutate(undefined, {
            onSuccess: (r) =>
              Alert.alert(
                'Grocery list updated',
                r.added.length > 0
                  ? `Added ${r.added.length} item${r.added.length === 1 ? '' : 's'} (${r.skipped} already on the list).`
                  : 'Everything is already on your list.',
              ),
            onError: () => Alert.alert('Could not update list', 'Please try again.'),
          }),
      },
    ]);

  const busy = autoFill.isPending || toGrocery.isPending;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: SCREEN_PADDING, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={type.screenTitle}>Meal Plan</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={confirmAutoFill}
              disabled={busy}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: colors.primaryLight,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {autoFill.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              )}
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.primary }}>
                Auto-fill
              </Text>
            </Pressable>
            <Pressable
              onPress={confirmGrocery}
              disabled={busy}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: colors.primaryLight,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {toGrocery.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="cart-outline" size={16} color={colors.primary} />
              )}
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.primary }}>
                Grocery
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Week pager */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setMonday((m) => shiftWeek(m, -1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={type.sectionHeader}>
              {data ? formatRange(data.weekStart, data.weekEnd) : '…'}
            </Text>
          </View>
          <Pressable onPress={() => setMonday((m) => shiftWeek(m, 1))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
          {!isThisWeek && (
            <Pressable onPress={() => setMonday(mondayOf(new Date()))} hitSlop={8}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.primary }}>
                This week
              </Text>
            </Pressable>
          )}
        </View>

        {plan.isLoading ? (
          <WeekSkeleton />
        ) : plan.isError ? (
          <ErrorState onRetry={() => plan.refetch()} />
        ) : (
          <>
            {entries.length === 0 && (
              <Card style={{ padding: 16 }}>
                <EmptyState message="Nothing planned this week. Tap + on a slot, or Auto-fill the whole week." />
              </Card>
            )}
            {days.map((day, di) => (
              <View key={day.date} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={type.sectionHeader}>
                    {DAY_NAMES[di]}{' '}
                    {new Date(`${day.date}T00:00:00`).getDate()}
                  </Text>
                  <Text style={type.caption}>
                    {day.calories > 0
                      ? `${day.calories}${goalCal != null ? ` / ${goalCal}` : ''} cal · P ${day.protein} · C ${day.carbs} · F ${day.fat}`
                      : 'No meals yet'}
                  </Text>
                </View>
                <Card style={{ padding: 4 }}>
                  {SLOTS.map((slot, si) => (
                    <SlotSection
                      key={slot}
                      slot={slot}
                      entries={entries.filter((e) => e.date === day.date && e.slot === slot)}
                      isLast={si === SLOTS.length - 1}
                      onAdd={() => setPicker({ date: day.date, slot })}
                      onRemove={(id) => remove.mutate(id)}
                    />
                  ))}
                </Card>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {picker && (
        <EntryPicker
          date={picker.date}
          slot={picker.slot}
          onClose={() => setPicker(null)}
          onPickRecipe={(recipe) => {
            add.mutate({ date: picker.date, slot: picker.slot, recipe });
            setPicker(null);
          }}
          onPickCustom={(customName) => {
            add.mutate({ date: picker.date, slot: picker.slot, customName });
            setPicker(null);
          }}
        />
      )}
    </Screen>
  );
}

function SlotSection({
  slot,
  entries,
  isLast,
  onAdd,
  onRemove,
}: {
  slot: MealPlanSlot;
  entries: MealPlanEntry[];
  isLast: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 8,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={SLOT_ICONS[slot]} size={16} color={colors.primary} />
        <Text style={[type.caption, { flex: 1 }]}>{SLOT_LABELS[slot]}</Text>
        <Pressable onPress={onAdd} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>
      {entries.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {e.recipe?.imageUrl ? (
            <Image
              source={{ uri: e.recipe.imageUrl }}
              style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border }}
            />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="fast-food-outline" size={16} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={1}>
              {e.recipe?.title ?? e.customName}
            </Text>
            <Text style={type.caption}>
              {e.recipe?.calories != null
                ? `${e.recipe.calories * e.servings} cal${e.servings > 1 ? ` · ${e.servings} servings` : ''}`
                : 'Custom meal'}
            </Text>
          </View>
          <Pressable onPress={() => onRemove(e.id)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function WeekSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={{ width: 120, height: 18, borderRadius: 6, backgroundColor: colors.border }} />
          <Card style={{ padding: 16, gap: 12 }}>
            {[0, 1, 2].map((j) => (
              <View
                key={j}
                style={{ height: 14, borderRadius: 6, backgroundColor: colors.border, width: `${80 - j * 15}%` }}
              />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

type PickerTab = 'search' | 'favorites' | 'custom';

function EntryPicker({
  date,
  slot,
  onClose,
  onPickRecipe,
  onPickCustom,
}: {
  date: string;
  slot: MealPlanSlot;
  onClose: () => void;
  onPickRecipe: (recipe: Recipe) => void;
  onPickCustom: (name: string) => void;
}) {
  const [tab, setTab] = useState<PickerTab>('search');
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const search = useRecipeSearch(query);
  const favorites = useFavorites();

  const recipes: Recipe[] =
    tab === 'search' ? search.data?.recipes ?? [] : favorites.data?.recipes ?? [];

  const label = `${SLOT_LABELS[slot]} · ${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      {/* A bottom sheet with a text field: without this the keyboard rose
          straight over the search and custom-name inputs. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-end' }}
      >
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: SCREEN_PADDING,
            gap: 12,
            maxHeight: '80%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[type.sectionHeader, { flex: 1 }]} numberOfLines={1}>
              {label}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['search', 'favorites', 'custom'] as PickerTab[]).map((t) => {
              const active = t === tab;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: 12.5,
                      color: active ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'custom' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="e.g. Leftover pizza"
                placeholderTextColor={colors.textTertiary}
                autoFocus
                style={{
                  flex: 1,
                  height: 48,
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  fontFamily: fonts.regular,
                  fontSize: 14,
                  color: colors.textPrimary,
                }}
              />
              <Pressable
                onPress={() => customName.trim() && onPickCustom(customName.trim())}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark" size={22} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <>
              {tab === 'search' && (
                <View
                  style={{
                    height: 48,
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    gap: 8,
                  }}
                >
                  <Ionicons name="search" size={18} color={colors.textSecondary} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search recipes..."
                    placeholderTextColor={colors.textTertiary}
                    autoFocus
                    style={{
                      flex: 1,
                      fontFamily: fonts.regular,
                      fontSize: 14,
                      color: colors.textPrimary,
                    }}
                  />
                </View>
              )}
              <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
                {tab === 'search' && query.trim().length === 0 ? (
                  <Text style={[type.caption, { textAlign: 'center', paddingVertical: 24 }]}>
                    Type to search all recipes
                  </Text>
                ) : tab === 'search' && search.isLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />
                ) : tab === 'favorites' && favorites.isLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />
                ) : recipes.length === 0 ? (
                  <Text style={[type.caption, { textAlign: 'center', paddingVertical: 24 }]}>
                    {tab === 'favorites' ? 'No favorites yet' : 'No matches'}
                  </Text>
                ) : (
                  recipes.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => onPickRecipe(r)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      {r.imageUrl ? (
                        <Image
                          source={{ uri: r.imageUrl }}
                          style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.border }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: colors.primaryLight,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="fast-food-outline" size={18} color={colors.primary} />
                        </View>
                      )}
                      <Text style={[type.body, { flex: 1, fontFamily: fonts.medium }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.calories != null && <Text style={type.caption}>{r.calories} cal</Text>}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
