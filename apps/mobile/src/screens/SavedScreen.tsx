import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, type } from '../theme/typography';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { MealSuggestionCard } from '../components/MealSuggestionCard';
import { ErrorState } from '../components/States';
import { useFavorites } from '../hooks/useFavorites';
import type { RootStackParamList } from '../navigation/types';

export function SavedScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const favorites = useFavorites();
  const recipes = favorites.data?.recipes ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: SCREEN_PADDING, gap: 14 }}>
        {favorites.isError ? (
          <ErrorState onRetry={() => favorites.refetch()} />
        ) : recipes.length === 0 ? (
          <Card style={{ padding: 24, alignItems: 'center', gap: 8 }}>
            <Ionicons name="heart-outline" size={28} color={colors.textTertiary} />
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              No saved recipes yet. Tap "Save" on any recipe to keep it here.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 14 }}>
            {recipes.map((r) => (
              <MealSuggestionCard
                key={r.id}
                recipe={r}
                onPress={() => nav.navigate('RecipeDetail', { recipe: r })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
