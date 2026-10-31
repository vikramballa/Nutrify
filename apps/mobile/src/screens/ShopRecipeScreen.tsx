import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isPantryStaple } from '@nutrichef/shared';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { FadeIn, PopIn, PressableScale } from '../theme/motion';
import { Card } from '../components/Card';
import { useGrocery } from '../hooks/useGrocery';

const keyOf = (name: string) => name.trim().toLowerCase();

interface Row {
  key: string;
  name: string;
  measure: string;
}

/** One row per ingredient name; a recipe that lists water twice asks once. */
function rowsOf(ingredients: { name: string; measure: string; position: number }[]): Row[] {
  const rows = new Map<string, Row>();
  for (const ing of [...ingredients].sort((a, b) => a.position - b.position)) {
    const key = keyOf(ing.name);
    const seen = rows.get(key);
    if (seen) seen.measure = [seen.measure, ing.measure.trim()].filter(Boolean).join(' + ');
    else rows.set(key, { key, name: ing.name.trim(), measure: ing.measure.trim() });
  }
  return [...rows.values()];
}

/**
 * Before shopping for a recipe, the user marks what is already in the kitchen;
 * only the rest goes on the grocery list, with the recipe's quantities, ready
 * to buy from Blinkit, Zepto or Instamart.
 */
export function ShopRecipeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { recipe } = useRoute<RouteProp<RootStackParamList, 'ShopRecipe'>>().params;
  const { list, addFromRecipe } = useGrocery();

  const rows = useMemo(() => rowsOf(recipe.ingredients), [recipe.ingredients]);
  // Things already waiting on the list don't need marking again.
  const onList = useMemo(
    () => new Set((list.data ?? []).filter((i) => !i.checked).map((i) => keyOf(i.name))),
    [list.data],
  );
  // Salt, water and dry spices start as "have"; everything else as "need",
  // so the user only taps what they already own.
  const [have, setHave] = useState<Set<string>>(
    () => new Set(rows.filter((r) => isPantryStaple(r.name)).map((r) => r.key)),
  );
  const [added, setAdded] = useState<number | null>(null);

  const open = rows.filter((r) => !onList.has(r.key));
  const need = open.filter((r) => !have.has(r.key));

  const toggle = (key: string) =>
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const markAll = (owned: boolean) => setHave(owned ? new Set(rows.map((r) => r.key)) : new Set());

  async function addMissing() {
    const res = await addFromRecipe.mutateAsync({
      recipeId: recipe.id,
      names: need.map((r) => r.name),
    });
    setAdded(res.added.length);
  }

  if (added != null) {
    return (
      <View style={[styles.container, styles.done]}>
        <PopIn>
          <View style={styles.doneIcon}>
            <Ionicons name="bag-check" size={40} color={colors.success} />
          </View>
        </PopIn>
        <FadeIn delay={80} style={styles.doneText}>
          <Text style={[type.screenTitle, styles.center]}>
            {added === 0 ? 'Already on your list' : `${added} item${added === 1 ? '' : 's'} added`}
          </Text>
          <Text style={[type.caption, styles.center]}>
            Open your grocery list and tap the bag next to an item to buy it on Blinkit, Zepto or
            Instamart.
          </Text>
        </FadeIn>
        <FadeIn delay={140} style={styles.doneActions}>
          <PressableScale
            onPress={() => nav.navigate('Tabs', { screen: 'Grocery' })}
            haptic
            style={[styles.bigButton, styles.bigButtonPrimary]}
          >
            <Ionicons name="cart" size={18} color="#fff" />
            <Text style={[styles.bigButtonLabel, styles.onPrimary]}>Buy now</Text>
          </PressableScale>
          <PressableScale onPress={() => nav.goBack()} style={[styles.bigButton, styles.bigButtonSecondary]}>
            <Text style={[styles.bigButtonLabel, styles.onSecondary]}>Back to recipe</Text>
          </PressableScale>
        </FadeIn>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={type.sectionHeader} numberOfLines={2}>
            {recipe.name}
          </Text>
          <Text style={[type.caption, styles.subtitle]}>
            Tap everything you already have. The rest goes on your grocery list.
          </Text>
        </FadeIn>

        <FadeIn delay={40} style={styles.summaryRow}>
          <View style={[styles.stat, styles.statNeed]}>
            <Text style={[styles.statNumber, { color: colors.primaryDark }]}>{need.length}</Text>
            <Text style={styles.statLabel}>to buy</Text>
          </View>
          <View style={[styles.stat, styles.statHave]}>
            <Text style={[styles.statNumber, { color: colors.success }]}>{open.length - need.length}</Text>
            <Text style={styles.statLabel}>in your kitchen</Text>
          </View>
        </FadeIn>

        <FadeIn delay={70} style={styles.quickRow}>
          <QuickChip label="I have everything" icon="checkmark-done" onPress={() => markAll(true)} />
          <QuickChip label="Need everything" icon="cart-outline" onPress={() => markAll(false)} />
        </FadeIn>

        <Card style={styles.listCard}>
          {rows.map((row, i) => {
            const listed = onList.has(row.key);
            const owned = have.has(row.key);
            return (
              <FadeIn key={row.key} index={i} offset={6}>
                <PressableScale
                  onPress={() => toggle(row.key)}
                  disabled={listed}
                  scaleTo={0.98}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: owned, disabled: listed }}
                  accessibilityLabel={`${row.name}: ${listed ? 'already on your list' : owned ? 'have it' : 'need to buy'}`}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  <View style={styles.flex1}>
                    <Text style={[type.body, listed && styles.muted]} numberOfLines={2}>
                      {row.name}
                    </Text>
                    {row.measure ? (
                      <Text style={[type.caption, styles.measure]} numberOfLines={1}>
                        {row.measure}
                      </Text>
                    ) : null}
                  </View>
                  {listed ? (
                    <View style={[styles.pill, styles.pillListed]}>
                      <Ionicons name="list" size={12} color={colors.textSecondary} />
                      <Text style={[styles.pillText, { color: colors.textSecondary }]}>On your list</Text>
                    </View>
                  ) : owned ? (
                    <View style={[styles.pill, styles.pillHave]}>
                      <Ionicons name="checkmark" size={13} color={colors.success} />
                      <Text style={[styles.pillText, { color: colors.success }]}>Have it</Text>
                    </View>
                  ) : (
                    <View style={[styles.pill, styles.pillNeed]}>
                      <Ionicons name="cart-outline" size={13} color={colors.primaryDark} />
                      <Text style={[styles.pillText, { color: colors.primaryDark }]}>Need</Text>
                    </View>
                  )}
                </PressableScale>
              </FadeIn>
            );
          })}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {addFromRecipe.isError && (
          <Text style={styles.error}>Couldn't update your list. Check your connection and try again.</Text>
        )}
        <PressableScale
          onPress={addMissing}
          haptic
          disabled={need.length === 0 || addFromRecipe.isPending}
          style={[styles.bigButton, styles.bigButtonPrimary, need.length === 0 && styles.disabled]}
        >
          {addFromRecipe.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name={need.length ? 'add-circle' : 'happy-outline'} size={20} color="#fff" />
              <Text style={[styles.bigButtonLabel, styles.onPrimary]}>
                {need.length === 0
                  ? 'You have everything'
                  : `Add ${need.length} item${need.length === 1 ? '' : 's'} to grocery list`}
              </Text>
            </>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

function QuickChip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={styles.quickChip} accessibilityRole="button">
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={styles.quickChipText}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: SCREEN_PADDING, paddingBottom: 24, gap: 16 },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  subtitle: { marginTop: 4 },
  muted: { color: colors.textSecondary },
  measure: { marginTop: 2 },

  summaryRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: 14 },
  statNeed: { backgroundColor: colors.primaryLight },
  statHave: { backgroundColor: colors.successLight },
  statNumber: { fontFamily: fonts.bold, fontSize: 24 },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, marginTop: 1 },

  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },

  listCard: { paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  pillNeed: { backgroundColor: colors.primaryLight },
  pillHave: { backgroundColor: colors.successLight },
  pillListed: { backgroundColor: colors.surfaceAlt },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },

  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 12,
    gap: 8,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, textAlign: 'center' },
  bigButton: {
    height: 54,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  bigButtonPrimary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bigButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryLight },
  bigButtonLabel: { fontFamily: fonts.semibold, fontSize: 15 },
  onPrimary: { color: '#fff' },
  onSecondary: { color: colors.primary },
  disabled: { opacity: 0.55, shadowOpacity: 0 },

  done: { justifyContent: 'center', padding: SCREEN_PADDING * 1.5, gap: 20 },
  doneIcon: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { gap: 8 },
  doneActions: { gap: 10 },
});
