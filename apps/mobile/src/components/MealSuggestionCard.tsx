import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { cardStyle, fonts, radii, type } from '../theme/typography';
import { PressableScale } from '../theme/motion';

/**
 * The taste engine already knows why it picked each recipe; showing that is
 * what turns a grid of photos into a recommendation the user can trust — and
 * correct, via the dismiss button.
 */
function WhyChips({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <View style={styles.whyRow}>
      <Ionicons name="sparkles" size={11} color={colors.primary} />
      <Text style={styles.whyText} numberOfLines={1}>
        {reasons.join(' · ')}
      </Text>
    </View>
  );
}

export function MealSuggestionCard({
  recipe,
  onPress,
  reasons = [],
  onDismiss,
}: {
  recipe: Recipe;
  onPress: () => void;
  /** Taste tokens this recipe matched. Empty = an exploration pick. */
  reasons?: string[];
  onDismiss?: () => void;
}) {
  // Real API values only — a missing cook time / calorie count shows "—".
  const meta = [
    recipe.cookMinutes != null ? `${recipe.cookMinutes} min` : null,
    recipe.calories != null ? `${recipe.calories} cal` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${recipe.name}`}
        style={styles.card}
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            accessibilityLabel={`Photo of ${recipe.name}`}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Ionicons name="flash" size={40} color={colors.primary} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={type.cardTitle} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={[type.caption, styles.meta]}>{meta || '—'}</Text>
          <WhyChips reasons={reasons} />
        </View>
      </PressableScale>

      {onDismiss && (
        <PressableScale
          onPress={onDismiss}
          haptic
          scaleTo={0.86}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={`Show me less like ${recipe.name}`}
        >
          <Ionicons name="close" size={15} color={colors.textPrimary} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 260 },
  card: { ...cardStyle, overflow: 'hidden' },
  image: { width: '100%', height: 150 },
  imageFallback: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 14, gap: 4 },
  meta: { marginTop: 0 },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  whyText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.primary,
    letterSpacing: 0.1,
  },
  dismiss: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
