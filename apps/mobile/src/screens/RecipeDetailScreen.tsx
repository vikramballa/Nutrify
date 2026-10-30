import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, type } from '../theme/typography';
import { Counter, FadeIn, PressableScale } from '../theme/motion';
import { Card } from '../components/Card';
import { Skeleton } from '../components/Skeleton';
import { BoldText } from '../components/BoldText';
import { CookInstructions } from '../components/CookInstructions';
import { splitSteps } from '../components/cookSteps';
import { IngredientsList } from '../components/IngredientsList';
import { useInsights, useNutrition } from '../hooks/useInsights';
import { useLogMeal, currentMealType } from '../hooks/useLogs';
import { useFavorites, useToggleFavorite } from '../hooks/useFavorites';
import { useGrocery } from '../hooks/useGrocery';
import type { RootStackParamList } from '../navigation/types';

function ActionButton({
  icon,
  label,
  onPress,
  busy,
  done,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  done?: boolean;
  primary?: boolean;
}) {
  const fg = primary ? '#fff' : done ? colors.primary : colors.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.95}
      disabled={busy || done}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.actionButton,
        primary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        done && styles.actionButtonDone,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={fg} />
          <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

/** Hero height, and how far the image is allowed to drift while scrolling. */
const HERO_HEIGHT = 300;

export function RecipeDetailScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { recipe } = useRoute<RouteProp<RootStackParamList, 'RecipeDetail'>>().params;
  const insights = useInsights(recipe.id);
  const nutrition = useNutrition(recipe.id);

  const logMeal = useLogMeal();
  const [logged, setLogged] = useState(false);
  const favorites = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFav = favorites.data?.recipes.some((r) => r.id === recipe.id) ?? false;
  const grocery = useGrocery();
  const [addedToGrocery, setAddedToGrocery] = useState(false);

  // Real timings only — no invented cook time. Total shows when known.
  const total =
    recipe.cookMinutes != null || recipe.prepMinutes != null
      ? (recipe.cookMinutes ?? 0) + (recipe.prepMinutes ?? 0)
      : null;
  // TheMealDB ships one blob with "1.\t" markers inline, so a blank-line
  // split leaves every step crammed into the first one.
  const paragraphs = splitSteps(recipe.instructions);

  const macros = nutrition.data;
  const macroStats = macros
    ? [
        { value: macros.calories, unit: '', label: 'Cal' },
        { value: macros.protein, unit: 'g', label: 'Protein' },
        { value: macros.carbs, unit: 'g', label: 'Carbs' },
        { value: macros.fat, unit: 'g', label: 'Fat' },
      ]
    : null;

  const scrollY = useRef(new Animated.Value(0)).current;
  const heroTransform = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
          outputRange: [-HERO_HEIGHT / 2, 0, HERO_HEIGHT / 2],
        }),
      },
      {
        // Only overscroll (negative offset) zooms; scrolling up must not
        // magnify the image as it leaves.
        scale: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0],
          outputRange: [2, 1],
          extrapolateRight: 'clamp',
        }),
      },
    ],
  };

  async function addIngredientsToGrocery() {
    if (addedToGrocery) return;
    await grocery.addFromRecipe.mutateAsync(recipe.id);
    setAddedToGrocery(true);
  }

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* Hero — drifts at half speed while scrolling up, and overscrolls
            into a zoom when pulled down, so the photo feels attached to the
            page rather than pasted on top of it. */}
        <Animated.View style={[styles.heroWrap, heroTransform]}>
          {recipe.imageUrl ? (
            <Image
              source={{ uri: recipe.imageUrl }}
              style={styles.hero}
              contentFit="cover"
              transition={260}
              cachePolicy="memory-disk"
              accessibilityLabel={`Photo of ${recipe.name}`}
            />
          ) : (
            <View style={[styles.hero, styles.heroFallback]}>
              <Ionicons name="flash" size={64} color={colors.primary} />
            </View>
          )}
        </Animated.View>

        <View style={styles.body}>
          <FadeIn>
            <Text style={type.screenTitle}>{recipe.name}</Text>
            <Text style={[type.caption, styles.subtitle]}>
              {recipe.category} • {recipe.cuisine}
              {total != null ? ` • ${total} min` : ''}
            </Text>
          </FadeIn>

          {/* Primary actions — the point of opening a recipe. */}
          <FadeIn delay={70} style={styles.actionsRow}>
            <ActionButton
              icon={logged ? 'checkmark' : 'add-circle-outline'}
              label={logged ? 'Logged' : 'Log meal'}
              primary
              busy={logMeal.isPending}
              onPress={() =>
                logMeal.mutate(
                  { recipeId: recipe.id, mealType: currentMealType() },
                  { onSuccess: () => setLogged(true) },
                )
              }
            />
            <ActionButton
              icon={isFav ? 'heart' : 'heart-outline'}
              label={isFav ? 'Saved' : 'Save'}
              busy={toggleFav.isPending}
              onPress={() => toggleFav.mutate(recipe.id)}
            />
            <ActionButton
              icon={addedToGrocery ? 'checkmark' : 'cart-outline'}
              label={addedToGrocery ? 'Added' : 'Shop'}
              done={addedToGrocery}
              busy={grocery.addFromRecipe.isPending}
              onPress={addIngredientsToGrocery}
            />
          </FadeIn>

          {/* Real per-serving nutrition (USDA-backed). */}
          {macroStats && (
            <FadeIn delay={120}>
              <Card style={styles.cardPadding}>
                <View style={styles.nutritionHeader}>
                  <Text style={type.sectionHeader}>Nutrition per serving</Text>
                  {/* Estimated from the recipe's total weight — say so, since
                      every number above is divided by it. */}
                  <Text style={type.caption}>
                    Recipe makes about {macros!.servings}{' '}
                    {macros!.servings === 1 ? 'serving' : 'servings'}
                  </Text>
                </View>
                <View style={styles.macrosRow}>
                  {macroStats.map((s, i) => (
                    <View key={s.label} style={styles.macroItem}>
                      <Counter
                        value={s.value}
                        delay={200 + i * 70}
                        style={type.statNumber}
                        format={(n) => `${n}${s.unit}`}
                      />
                      <Text style={[type.caption, styles.macroLabel]}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeIn>
          )}

          {/* AI Insights — hidden entirely when unavailable (503/error). */}
          {!insights.isError && (
            <Card style={styles.insightsCard}>
              <View style={styles.insightsHeader}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
                <Text style={type.sectionHeader}>AI Insights</Text>
              </View>
              {insights.isLoading || !insights.data ? (
                <View style={styles.insightsSkeleton}>
                  {[0.95, 0.85, 0.7].map((w, i) => (
                    <Skeleton key={i} width={`${w * 100}%`} height={12} borderRadius={6} />
                  ))}
                </View>
              ) : (
                <BoldText text={insights.data.content} />
              )}
            </Card>
          )}

          {/* Ingredients */}
          <IngredientsList items={recipe.ingredients} />

          {/* Instructions — interactive cook mode */}
          <CookInstructions steps={paragraphs.map((p) => p.trim())} />
        </View>
      </Animated.ScrollView>

      {/* Status-bar backdrop. The hero sits under the status bar by design;
          once it scrolls away, body text ran straight under the clock. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.statusBackdrop,
          {
            height: insets.top,
            opacity: scrollY.interpolate({
              inputRange: [HERO_HEIGHT - insets.top - 40, HERO_HEIGHT - insets.top],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />

      {/* Back arrow */}
      <PressableScale
        onPress={() => nav.goBack()}
        scaleTo={0.88}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonDone: {
    borderColor: colors.primary,
  },
  actionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 40 },
  // The wrapper is what moves; the image itself stays a plain child so the
  // parallax transform does not fight the layout.
  heroWrap: { width: '100%', height: HERO_HEIGHT },
  hero: { width: '100%', height: HERO_HEIGHT },
  heroFallback: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: SCREEN_PADDING, gap: 20 },
  subtitle: { marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  cardPadding: { padding: 20 },
  nutritionHeader: { marginBottom: 14, gap: 2 },
  macrosRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroItem: { alignItems: 'center' },
  macroLabel: { marginTop: 2 },
  insightsCard: { padding: 20, gap: 12 },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightsSkeleton: { gap: 8 },
  backButton: {
    position: 'absolute',
    left: SCREEN_PADDING,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
