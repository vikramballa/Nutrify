import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { cardStyle, radii, type } from '../theme/typography';
import { PressableScale } from '../theme/motion';

/** `tile` is the half-width grid variant; `full` is the original wide card. */
export function RecipeCard({
  recipe,
  onPress,
  variant = 'full',
}: {
  recipe: Recipe;
  onPress: () => void;
  variant?: 'full' | 'tile';
}) {
  const tile = variant === 'tile';
  const imageHeight = tile ? 118 : 180;
  const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${recipe.name}`}
      style={[cardStyle, { overflow: 'hidden', flex: tile ? 1 : undefined }]}
    >
      <View>
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={{ width: '100%', height: imageHeight }}
            // expo-image caches to disk and cross-fades in, so a scrolled-back
            // grid does not flash grey placeholders a second time.
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            accessibilityLabel={`Photo of ${recipe.name}`}
          />
        ) : (
          <View
            style={{
              height: imageHeight,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="restaurant-outline" size={tile ? 28 : 44} color={colors.primary} />
          </View>
        )}
        {/* Cook time reads better over the photo than in a metadata line. */}
        {minutes > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radii.pill,
              backgroundColor: 'rgba(20,14,10,0.62)',
            }}
          >
            <Ionicons name="time-outline" size={11} color="#fff" />
            <Text style={{ fontFamily: type.caption.fontFamily, fontSize: 11, color: '#fff' }}>
              {minutes}m
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: tile ? 11 : 16, gap: 3 }}>
        <Text style={[type.cardTitle, tile && { fontSize: 14.5 }]} numberOfLines={tile ? 2 : 1}>
          {recipe.name}
        </Text>
        <Text style={[type.caption, tile && { fontSize: 11.5 }]} numberOfLines={1}>
          {recipe.cuisine} · {recipe.category}
        </Text>
        {recipe.calories != null && (
          <Text
            style={{
              fontFamily: type.statNumber.fontFamily,
              fontSize: tile ? 12 : 13,
              color: colors.primary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {recipe.calories} cal
          </Text>
        )}
      </View>
    </PressableScale>
  );
}
