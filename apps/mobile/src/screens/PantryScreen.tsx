import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MealType, PantryIdea } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { FadeIn, PopIn, PressableScale } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { usePantryIdeas } from '../hooks/useAssistant';
import { useGrocery } from '../hooks/useGrocery';
import { useAiConsent } from '../hooks/useAiConsent';

/** One tap each for the things most kitchens already have. */
const QUICK_ADD = [
  'eggs',
  'onion',
  'tomato',
  'rice',
  'potato',
  'paneer',
  'chicken',
  'spinach',
  'yogurt',
  'lentils',
  'bread',
  'cheese',
];

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MAX_INGREDIENTS = 40; // matches PantryRequestSchema

function humanError(err: { status?: number } | null): string {
  switch (err?.status) {
    case 403:
      return 'Turn on AI features in Settings to get ideas.';
    case 503:
      return 'Ideas are unavailable right now. Please try again in a few minutes.';
    case 502:
      return 'Something went wrong while cooking up ideas. Please try again.';
    default:
      return 'Could not reach the assistant. Check your connection and try again.';
  }
}

export function PantryScreen() {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [mealType, setMealType] = useState<MealType | undefined>();
  const ideas = usePantryIdeas();
  const aiConsent = useAiConsent();

  /** Accepts "onion, garlic, rice" in one go — people paste lists. */
  function addDraft(text = draft) {
    const fresh = text
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (fresh.length === 0) return;
    setItems((prev) => {
      const merged = [...prev];
      for (const f of fresh) {
        if (!merged.includes(f) && merged.length < MAX_INGREDIENTS) merged.push(f);
      }
      return merged;
    });
    setDraft('');
  }

  const toggleQuick = (name: string) =>
    setItems((prev) =>
      prev.includes(name)
        ? prev.filter((i) => i !== name)
        : prev.length < MAX_INGREDIENTS
          ? [...prev, name]
          : prev,
    );

  const results = ideas.data?.ideas ?? [];
  const canSearch = items.length > 0 && !ideas.isPending;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        // The keyboard otherwise covers the lower fields and the save button.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <Text style={type.screenTitle}>What can I cook?</Text>
          <Text style={[type.caption, styles.subtitle]}>
            List what is in your kitchen and the assistant works backwards from it.
          </Text>
        </FadeIn>

        <FadeIn delay={70}>
          <View style={styles.inputRow}>
            <Ionicons name="basket-outline" size={19} color={colors.textTertiary} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => addDraft()}
              placeholder="Add an ingredient"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              autoCapitalize="none"
              style={styles.input}
            />
            <PressableScale
              onPress={() => addDraft()}
              disabled={draft.trim().length === 0}
              scaleTo={0.9}
              style={[styles.addButton, draft.trim().length === 0 && styles.addButtonOff]}
              accessibilityRole="button"
              accessibilityLabel="Add ingredient"
            >
              <Ionicons
                name="add"
                size={20}
                color={draft.trim().length > 0 ? '#fff' : colors.primary}
              />
            </PressableScale>
          </View>
        </FadeIn>

        {items.length > 0 && (
          <FadeIn offset={8}>
            <View style={styles.chipRow}>
              {items.map((item, i) => (
                <PopIn key={item} delay={i * 25}>
                  <PressableScale
                    onPress={() => setItems((prev) => prev.filter((x) => x !== item))}
                    scaleTo={0.92}
                    style={styles.selectedChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item}`}
                  >
                    <Text style={styles.selectedChipText}>{item}</Text>
                    <Ionicons name="close" size={13} color="#fff" />
                  </PressableScale>
                </PopIn>
              ))}
            </View>
          </FadeIn>
        )}

        <FadeIn delay={120}>
          <Text style={[type.eyebrow, styles.eyebrow]}>QUICK ADD</Text>
          <View style={styles.chipRow}>
            {QUICK_ADD.map((name) => {
              const active = items.includes(name);
              return (
                <PressableScale
                  key={name}
                  onPress={() => toggleQuick(name)}
                  scaleTo={0.94}
                  style={[styles.quickChip, active && styles.quickChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                    {name}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </FadeIn>

        <FadeIn delay={160}>
          <Text style={[type.eyebrow, styles.eyebrow]}>MEAL (OPTIONAL)</Text>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((m) => {
              const active = m === mealType;
              return (
                <PressableScale
                  key={m}
                  onPress={() => setMealType(active ? undefined : m)}
                  scaleTo={0.94}
                  style={[styles.quickChip, active && styles.quickChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </FadeIn>

        <FadeIn delay={200}>
          <PressableScale
            onPress={async () => {
              if (await aiConsent.ensure()) ideas.mutate({ ingredients: items, mealType });
            }}
            haptic
            disabled={!canSearch}
            style={[styles.searchButton, !canSearch && styles.searchButtonOff]}
          >
            {ideas.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={19} color={canSearch ? '#fff' : colors.primary} />
                <Text style={[styles.searchLabel, !canSearch && styles.searchLabelOff]}>
                  {items.length === 0
                    ? 'Add something first'
                    : `Find dishes from ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
                </Text>
              </>
            )}
          </PressableScale>
        </FadeIn>

        {ideas.isError && (
          <FadeIn offset={6}>
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{humanError(ideas.error)}</Text>
            </View>
          </FadeIn>
        )}

        {results.map((idea, i) => (
          <IdeaCard key={`${idea.name}-${i}`} idea={idea} index={i} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function IdeaCard({ idea, index }: { idea: PantryIdea; index: number }) {
  const [open, setOpen] = useState(index === 0); // the best match starts expanded
  const grocery = useGrocery();
  const [added, setAdded] = useState(false);
  const cookNow = idea.missing.length === 0;

  async function addMissing() {
    if (added) return;
    await Promise.all(idea.missing.map((name) => grocery.add.mutateAsync(name)));
    setAdded(true);
  }

  return (
    <FadeIn delay={80 + index * 90}>
      <Card style={styles.ideaCard}>
        <View style={styles.ideaHeader}>
          <View style={styles.flex1}>
            <Text style={type.cardTitle}>{idea.name}</Text>
            <Text style={[type.caption, styles.captionTop]}>
              {idea.cuisine} · {idea.minutes} min · ~{idea.calories} cal
            </Text>
          </View>
          {cookNow && (
            <View style={styles.readyBadge}>
              <Ionicons name="checkmark-circle" size={13} color={colors.success} />
              <Text style={styles.readyBadgeText}>Ready now</Text>
            </View>
          )}
        </View>

        {idea.uses.length > 0 && (
          <View style={styles.tagRow}>
            {idea.uses.map((u) => (
              <View key={u} style={styles.usesTag}>
                <Text style={styles.usesTagText}>{u}</Text>
              </View>
            ))}
          </View>
        )}

        {idea.missing.length > 0 && (
          <View style={styles.missingBlock}>
            <View style={styles.missingHeader}>
              <Ionicons name="cart-outline" size={14} color={colors.highlightText} />
              <Text style={styles.missingTitle}>
                Still need {idea.missing.length} {idea.missing.length === 1 ? 'thing' : 'things'}
              </Text>
              <PressableScale
                onPress={addMissing}
                scaleTo={0.94}
                disabled={added || grocery.add.isPending}
                style={styles.missingAdd}
                accessibilityRole="button"
                accessibilityLabel="Add missing items to grocery list"
              >
                <Text style={styles.missingAddText}>{added ? 'Added' : 'Add to list'}</Text>
              </PressableScale>
            </View>
            <View style={styles.tagRow}>
              {idea.missing.map((m) => (
                <View key={m} style={styles.missingTag}>
                  <Text style={styles.missingTagText}>{m}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <PressableScale
          onPress={() => setOpen((o) => !o)}
          scaleTo={0.98}
          style={styles.stepsToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.stepsToggleText}>
            {open ? 'Hide steps' : `Show ${idea.steps.length} steps`}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </PressableScale>

        {open && (
          <View style={styles.steps}>
            {idea.steps.map((step, i) => (
              <FadeIn key={i} index={i} offset={8}>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={[type.body, styles.flex1]}>{step}</Text>
                </View>
              </FadeIn>
            ))}
          </View>
        )}
      </Card>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, paddingBottom: 40, gap: 16 },
  flex1: { flex: 1 },
  subtitle: { marginTop: 4 },
  captionTop: { marginTop: 3 },
  eyebrow: { marginBottom: 10 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 15,
    paddingRight: 6,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonOff: { backgroundColor: colors.primaryLight },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 13,
    paddingRight: 10,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  selectedChipText: { fontFamily: fonts.semibold, fontSize: 13, color: '#fff' },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  quickChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  quickChipTextActive: { color: colors.primaryDark, fontFamily: fonts.semibold },

  searchButton: {
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  searchButtonOff: { backgroundColor: colors.primaryLight, shadowOpacity: 0, elevation: 0 },
  searchLabel: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  searchLabelOff: { color: colors.primary },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 13,
    borderRadius: radii.md,
    backgroundColor: colors.dangerLight,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
  },

  ideaCard: { padding: 18, gap: 14 },
  ideaHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.successLight,
  },
  readyBadgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.success },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  usesTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  usesTagText: { fontFamily: fonts.medium, fontSize: 12, color: colors.primaryDark },

  missingBlock: {
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.highlight,
  },
  missingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missingTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: colors.highlightText,
  },
  missingAdd: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  missingAddText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.highlightText },
  missingTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  missingTagText: { fontFamily: fonts.medium, fontSize: 12, color: colors.highlightText },

  stepsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepsToggleText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },

  steps: { gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  stepNumber: {
    width: 23,
    height: 23,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.primaryDark },
});
