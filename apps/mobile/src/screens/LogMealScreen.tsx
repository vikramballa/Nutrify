import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { parseMealText, type CustomLogItem, type MealType } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, type } from '../theme/typography';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { useLogCustomMeal, useLogPreview, currentMealType } from '../hooks/useLogs';
import {
  BEVERAGES,
  BEVERAGE_SIZES,
  MEAL_ICONS,
  MEAL_LABELS,
  MEAL_TYPES,
  type BeverageOption,
} from '../lib/meals';
import type { RootStackParamList } from '../navigation/types';

type Item = { name: string; measure: string };

/** Keystrokes settle for this long before the preview asks the API. */
const PREVIEW_DEBOUNCE_MS = 500;

const itemKey = (it: { name: string; measure: string }) =>
  `${it.name.toLowerCase()}|${it.measure.toLowerCase()}`;

/** "Eggs, toast & coffee" — a name for a meal the user didn't bother naming. */
function autoName(items: CustomLogItem[]): string {
  const names = items.map((i) => i.name.trim()).filter(Boolean);
  const head = names.slice(0, 3).join(', ');
  const name = names.length > 3 ? `${head} +${names.length - 3}` : head;
  return name ? name[0].toUpperCase() + name.slice(1) : '';
}

const input = {
  flex: 1,
  height: 44,
  backgroundColor: colors.surface,
  borderRadius: 12,
  paddingHorizontal: 12,
  fontFamily: fonts.regular,
  fontSize: 15,
  color: colors.textPrimary,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

export function LogMealScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'LogMeal'>>();
  const logMeal = useLogCustomMeal();
  const quickRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>(route.params?.mealType ?? currentMealType());
  const [items, setItems] = useState<Item[]>([{ name: '', measure: '' }]);
  const [quick, setQuick] = useState('');
  const [drink, setDrink] = useState<BeverageOption | null>(null);
  const [drinkMl, setDrinkMl] = useState(150);

  const clean = useMemo(
    () =>
      items
        .map((it) => ({ name: it.name.trim(), measure: it.measure.trim() }))
        .filter((it) => it.name && it.measure),
    [items],
  );
  const [debounced, setDebounced] = useState<CustomLogItem[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(clean), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [clean]);
  const preview = useLogPreview(debounced);
  const byKey = new Map((preview.data?.items ?? []).map((p) => [itemKey(p), p]));
  const unresolved = (preview.data?.items ?? []).filter((p) => !p.resolved);

  // Typing a sentence rewrites the rows below; the rows stay editable for
  // anything the parser read wrong.
  const onQuickChange = (text: string) => {
    setQuick(text);
    setDrink(null);
    const parsed = parseMealText(text);
    setItems(parsed.length ? parsed : [{ name: '', measure: '' }]);
  };

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addRow = () => setItems((prev) => [...prev, { name: '', measure: '' }]);
  const removeRow = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));

  // Beverages asks what was drunk instead of leaving a blank box: a picked
  // drink becomes one priced item ("tea", "150 ml") the user can still edit.
  const pickMealType = (m: MealType) => {
    setMealType(m);
    if (m === 'beverage') Keyboard.dismiss();
  };
  const pickDrink = (option: BeverageOption, ml = option.ml) => {
    setDrink(option);
    setDrinkMl(ml);
    setQuick('');
    setItems([{ name: option.food, measure: `${ml} ml` }]);
    setName(option.label);
  };
  const typeOtherDrink = () => {
    setDrink(null);
    setName('');
    setItems([{ name: '', measure: '' }]);
    quickRef.current?.focus();
  };

  const save = () => {
    if (clean.length === 0)
      return Alert.alert('Add what you ate', 'e.g. "2 eggs, toast, 1 cup of milk"');
    const mealName = name.trim() || autoName(clean);

    logMeal.mutate(
      { name: mealName, mealType, items: clean },
      {
        onSuccess: () => nav.goBack(),
        onError: () => Alert.alert('Could not log meal', 'Please try again.'),
      },
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: SCREEN_PADDING, gap: 16 }}
        // The keyboard otherwise covers the lower fields and the save button.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <Text style={type.sectionHeader}>Which meal?</Text>
        {/* One row of five: icon over label, so "Beverages" fits on a small phone. */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {MEAL_TYPES.map((m) => {
            const active = m === mealType;
            return (
              <Pressable
                key={m}
                onPress={() => pickMealType(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  paddingHorizontal: 2,
                  borderRadius: 14,
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Ionicons
                  name={MEAL_ICONS[m]}
                  size={18}
                  color={active ? '#fff' : colors.textSecondary}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{
                    fontFamily: fonts.semibold,
                    fontSize: 11,
                    color: active ? '#fff' : colors.textSecondary,
                  }}
                >
                  {MEAL_LABELS[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mealType === 'beverage' && (
          <Card style={{ padding: 14, gap: 12 }}>
            <Text style={type.cardTitle}>What did you drink?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {BEVERAGES.map((b) => (
                <Choice
                  key={b.key}
                  label={b.label}
                  icon={b.icon}
                  active={drink?.key === b.key}
                  onPress={() => pickDrink(b)}
                />
              ))}
              <Choice
                label="Something else"
                icon="create-outline"
                active={false}
                onPress={typeOtherDrink}
              />
            </View>
            {drink && (
              <>
                <Text style={type.eyebrow}>HOW MUCH</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {BEVERAGE_SIZES.map((sz) => (
                    <Choice
                      key={sz.ml}
                      label={`${sz.label} · ${sz.ml} ml`}
                      active={drinkMl === sz.ml}
                      onPress={() => pickDrink(drink, sz.ml)}
                    />
                  ))}
                </View>
              </>
            )}
          </Card>
        )}

        <Text style={type.sectionHeader}>
          {mealType === 'beverage' ? 'Or type it' : 'Type what you ate'}
        </Text>
        <TextInput
          ref={quickRef}
          value={quick}
          onChangeText={onQuickChange}
          placeholder={
            mealType === 'beverage' ? '1 glass sugarcane juice' : '2 eggs, toast, 1 cup of milk'
          }
          placeholderTextColor={colors.textTertiary}
          multiline
          // Beverages opens on the drink picker, which the keyboard would hide.
          autoFocus={route.params?.mealType !== 'beverage'}
          style={[input, { height: 76, paddingTop: 12, textAlignVertical: 'top' }]}
        />

        {preview.data && debounced.length > 0 && (
          <Card style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {(
                [
                  ['calories', 'Cal', ''],
                  ['protein', 'Protein', 'g'],
                  ['carbs', 'Carbs', 'g'],
                  ['fat', 'Fat', 'g'],
                ] as const
              ).map(([k, label, unit]) => (
                <View key={k} style={{ alignItems: 'center' }}>
                  <Text style={type.statNumber}>
                    {preview.data.totals[k]}
                    {unit}
                  </Text>
                  <Text style={type.caption}>{label}</Text>
                </View>
              ))}
            </View>
            {unresolved.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Ionicons name="help-circle-outline" size={15} color={colors.highlightText} />
                <Text style={[type.caption, { flex: 1, color: colors.highlightText }]}>
                  Not recognised, counted as 0: {unresolved.map((u) => u.name).join(', ')}. Try a
                  simpler name, like "bread" for "sourdough toast".
                </Text>
              </View>
            )}
          </Card>
        )}

        <Text style={type.sectionHeader}>Meal name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={autoName(clean) || 'e.g. Chicken curry lunch'}
          placeholderTextColor={colors.textTertiary}
          style={[input, { height: 48 }]}
        />

        <Text style={type.sectionHeader}>What you ate</Text>
        <Card style={{ padding: 12, gap: 10 }}>
          {items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={it.name}
                onChangeText={(t) => setItem(i, { name: t })}
                placeholder="Rice"
                placeholderTextColor={colors.textTertiary}
                style={[input, { flex: 2 }]}
              />
              <TextInput
                value={it.measure}
                onChangeText={(t) => setItem(i, { measure: t })}
                placeholder="200g"
                placeholderTextColor={colors.textTertiary}
                style={input}
              />
              <RowCalories
                match={byKey.get(itemKey({ name: it.name.trim(), measure: it.measure.trim() }))}
                pending={!!it.name.trim() && !!it.measure.trim() && !preview.isError}
              />
              <Pressable onPress={() => removeRow(i)} hitSlop={8} disabled={items.length === 1}>
                <Ionicons
                  name="close-circle-outline"
                  size={22}
                  color={items.length === 1 ? colors.border : colors.textTertiary}
                />
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={addRow}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.primary }}>
              Add ingredient
            </Text>
          </Pressable>
        </Card>

        <Pressable
          onPress={save}
          disabled={logMeal.isPending}
          style={{
            height: 52,
            borderRadius: 16,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: logMeal.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#fff' }}>
            {logMeal.isPending
              ? 'Logging…'
              : preview.data && debounced.length > 0
                ? `Log ${preview.data.totals.calories} cal`
                : 'Log meal'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Choice({
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.primary : pressed ? colors.primaryLight : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
      })}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textSecondary} />}
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: 12.5,
          color: active ? '#fff' : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Per-row calories from the preview; "?" when no food matched. */
function RowCalories({
  match,
  pending,
}: {
  match?: { calories: number; resolved: boolean };
  pending: boolean;
}) {
  if (!match) {
    return pending ? (
      <ActivityIndicator size="small" color={colors.textTertiary} style={{ width: 44 }} />
    ) : (
      <View style={{ width: 44 }} />
    );
  }
  return (
    <Text
      style={{
        width: 44,
        textAlign: 'right',
        fontFamily: fonts.medium,
        fontSize: 12,
        color: match.resolved ? colors.textSecondary : colors.highlightText,
      }}
    >
      {match.resolved ? `${match.calories}` : '?'}
    </Text>
  );
}
