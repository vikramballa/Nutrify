import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Recipe } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, type } from '../theme/typography';
import { FadeIn } from '../theme/motion';
import { Screen } from '../components/Screen';
import { SearchBar } from '../components/SearchBar';
import { Skeleton } from '../components/Skeleton';
import { RecipeCard } from '../components/RecipeCard';
import { CuisineChips } from '../components/CuisineChips';
import { EmptyState, ErrorState, GeneratingIndicator } from '../components/States';
import {
  useBrowseRecipes,
  useCuisineRecipes,
  useCuisines,
  useRecipeSearch,
  useRandomRecipes,
} from '../hooks/useRecipes';
import type { RootStackParamList } from '../navigation/types';

/** Placeholder grid matching the tile layout, not a generic spinner. */
function GridSkeleton() {
  return (
    <View style={styles.skeletonGrid}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} width="47%" height={200} borderRadius={20} />
      ))}
    </View>
  );
}

export function RecipesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [showGenerating, setShowGenerating] = useState(false);
  const [cuisine, setCuisine] = useState('');

  // Debounce typing (600ms); submit fires immediately.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 600);
    return () => clearTimeout(t);
  }, [text]);

  const search = useRecipeSearch(query);
  const dayRecipe = useRandomRecipes(1);
  const cuisines = useCuisines();
  const browse = useBrowseRecipes(30);
  // Typing a search overrides the cuisine filter.
  const cuisineList = useCuisineRecipes(query.length === 0 ? cuisine : '');

  // "Generating recipe..." kicks in only after 2.5s of a pending request.
  useEffect(() => {
    if (search.isFetching) {
      const t = setTimeout(() => setShowGenerating(true), 2500);
      return () => clearTimeout(t);
    }
    setShowGenerating(false);
  }, [search.isFetching]);

  const open = (recipe: Recipe) => nav.navigate('RecipeDetail', { recipe });

  // One grid, three sources — searching wins over a cuisine chip, and with
  // neither the whole library is listed instead of a single lonely card.
  const mode = query.length > 0 ? 'search' : cuisine ? 'cuisine' : 'browse';
  const active = mode === 'search' ? search : mode === 'cuisine' ? cuisineList : browse;
  const list = active.data?.recipes ?? [];
  const loading = active.isFetching && !active.data;
  const dayPick = dayRecipe.data?.recipes[0];

  const heading =
    mode === 'search'
      ? `Results for “${query}”`
      : mode === 'cuisine'
        ? `${cuisine} recipes`
        : 'All recipes';

  function emptyBody() {
    if (loading) {
      return mode === 'search' && showGenerating ? <GeneratingIndicator /> : <GridSkeleton />;
    }
    if (active.isError) return <ErrorState onRetry={() => active.refetch()} />;
    if (mode === 'search') return <EmptyState message={`Nothing found for “${query}”`} />;
    if (mode === 'cuisine') return <EmptyState message={`No ${cuisine} recipes yet`} />;
    return <EmptyState message="No recipes in your library yet" />;
  }

  return (
    <Screen>
      <View style={styles.searchContainer}>
        <SearchBar value={text} onChangeText={setText} onSubmit={() => setQuery(text.trim())} />
      </View>
      {cuisines.data && cuisines.data.cuisines.length > 0 && (
        <CuisineChips cuisines={cuisines.data.cuisines} selected={cuisine} onSelect={setCuisine} />
      )}

      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          // Tiles cascade in two at a time, matching the two-column grid.
          <FadeIn index={Math.floor(index / 2)} offset={12} style={styles.flex1}>
            <RecipeCard recipe={item} variant="tile" onPress={() => open(item)} />
          </FadeIn>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* The hero only belongs on the idle screen; a search wants results first. */}
            {mode === 'browse' && (
              <FadeIn style={styles.heroBlock}>
                <Text style={type.eyebrow}>TODAY&apos;S PICK</Text>
                {dayRecipe.isError ? (
                  <ErrorState onRetry={() => dayRecipe.refetch()} />
                ) : dayPick ? (
                  <RecipeCard recipe={dayPick} onPress={() => open(dayPick)} />
                ) : (
                  <Skeleton width="100%" height={260} borderRadius={20} />
                )}
              </FadeIn>
            )}
            <View style={styles.headingRow}>
              <Text style={[type.sectionHeader, styles.flex1]}>{heading}</Text>
              {list.length > 0 && (
                <Text style={type.caption}>
                  {list.length} {list.length === 1 ? 'recipe' : 'recipes'}
                </Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={emptyBody()}
        ListFooterComponent={
          mode === 'browse' && list.length > 0 ? (
            <Text style={[type.caption, styles.footerNote]}>
              Search above or pick a cuisine to narrow things down
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchContainer: { paddingHorizontal: SCREEN_PADDING, paddingTop: 8, paddingBottom: 4 },
  listContent: { paddingHorizontal: SCREEN_PADDING, paddingBottom: 28 },
  column: { gap: 12, marginBottom: 12 },
  header: { gap: 14, paddingTop: 4 },
  heroBlock: { gap: 8 },
  headingRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  flex1: { flex: 1 },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  footerNote: { textAlign: 'center', marginTop: 16, color: colors.textTertiary },
});
