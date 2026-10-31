import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GROCERY_STORES,
  shoppingQuery,
  type GroceryItem,
  type GroceryStore,
  type GroceryStoreId,
} from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { FadeIn, PressableScale, ProgressBar, spring } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { EmptyState, ErrorState } from '../components/States';
import { BottomSheet } from '../components/BottomSheet';
import { useGrocery } from '../hooks/useGrocery';

const OTHER_GROUP = '__other__';
// The store picked last time is offered first. A per-device convenience, so
// AsyncStorage rather than the profile.
const STORE_KEY = 'grocery.lastStore';

/** Items keep server order (createdAt asc); groups take the position of
 *  their first item, with ungrouped manual entries always trailing. */
function groupByRecipe(items: GroceryItem[]) {
  const order: string[] = [];
  const groups = new Map<string, { title: string | null; items: GroceryItem[] }>();
  for (const item of items) {
    const key = item.recipeName ?? OTHER_GROUP;
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, { title: item.recipeName, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  order.sort((a, b) => (a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : 0));
  return order.map((key) => ({ key, ...groups.get(key)! }));
}

export function GroceryScreen() {
  const [text, setText] = useState('');
  const { list, add, toggle, remove } = useGrocery();
  const [buying, setBuying] = useState<GroceryItem | null>(null);
  const [lastStore, setLastStore] = useState<GroceryStoreId | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((id) => GROCERY_STORES.some((s) => s.id === id) && setLastStore(id as GroceryStoreId))
      .catch(() => {});
  }, []);

  // Opens the store's own app when installed (universal link), else its site.
  async function buyAt(store: GroceryStore, item: GroceryItem) {
    setBuying(null);
    setLastStore(store.id);
    AsyncStorage.setItem(STORE_KEY, store.id).catch(() => {});
    try {
      await Linking.openURL(store.searchUrl(shoppingQuery(item.name)));
      setOpenError(null);
    } catch {
      setOpenError(`Couldn't open ${store.name}. Try again or pick another store.`);
    }
  }
  const stores = lastStore
    ? [...GROCERY_STORES].sort((a, b) => (a.id === lastStore ? -1 : b.id === lastStore ? 1 : 0))
    : GROCERY_STORES;

  const submit = () => {
    const name = text.trim();
    if (!name) return;
    add.mutate(name);
    setText('');
  };

  const items = list.data ?? [];
  const done = items.filter((i) => i.checked).length;
  const groups = groupByRecipe(items);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn>
            <View style={styles.headerRow}>
              <Text style={[type.screenTitle, styles.flex1]}>Grocery</Text>
              {items.length > 0 && (
                <Text style={type.caption}>
                  {done} of {items.length} done
                </Text>
              )}
            </View>
            {/* Progress is the reason to open this screen twice — show it. */}
            {items.length > 0 && (
              <ProgressBar
                progress={done / items.length}
                height={6}
                color={colors.success}
                trackColor={colors.border}
                style={styles.progress}
              />
            )}
          </FadeIn>

          <FadeIn delay={60} style={styles.inputRow}>
            <View style={styles.inputWrap}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={submit}
                returnKeyType="done"
                placeholder="Add an item..."
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
            </View>
            <PressableScale
              onPress={submit}
              haptic
              scaleTo={0.9}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </PressableScale>
          </FadeIn>

          {items.some((i) => !i.checked) && (
            <FadeIn delay={90}>
              <Text style={[type.caption, styles.hint]}>
                Tap <Ionicons name="bag-handle-outline" size={13} color={colors.textSecondary} /> to
                buy an item on Blinkit, Zepto or Instamart, then tick it off.
              </Text>
            </FadeIn>
          )}
          {openError && <Text style={styles.error}>{openError}</Text>}

          {list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState message="No items yet" />
          ) : (
            groups.map((group, gi) => (
              <View key={group.key} style={styles.group}>
                {group.title && (
                  <Text style={[type.caption, styles.groupTitle]}>{group.title}</Text>
                )}
                <Card style={styles.listCard}>
                  {group.items.map((item, i) => (
                    <FadeIn key={item.id} index={gi === 0 ? i : 0} offset={8}>
                      <View style={[styles.row, i > 0 && styles.rowDivider]}>
                        <PressableScale
                          onPress={() => toggle.mutate({ id: item.id, checked: !item.checked })}
                          scaleTo={0.85}
                          haptic
                          hitSlop={8}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: item.checked }}
                          accessibilityLabel={item.name}
                        >
                          <Checkbox checked={item.checked} />
                        </PressableScale>
                        <View style={styles.flex1}>
                          <Text style={[type.body, item.checked && styles.rowDone]}>{item.name}</Text>
                          {item.quantity ? (
                            <Text style={[type.caption, styles.quantity]} numberOfLines={1}>
                              {item.quantity}
                            </Text>
                          ) : null}
                        </View>
                        {!item.checked && (
                          <PressableScale
                            onPress={() => setBuying(item)}
                            scaleTo={0.85}
                            haptic
                            hitSlop={8}
                            style={styles.buyButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Buy ${item.name}`}
                          >
                            <Ionicons name="bag-handle-outline" size={18} color={colors.primary} />
                          </PressableScale>
                        )}
                        <PressableScale
                          onPress={() => remove.mutate(item.id)}
                          scaleTo={0.85}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.name}`}
                        >
                          <Ionicons name="close" size={20} color={colors.textTertiary} />
                        </PressableScale>
                      </View>
                    </FadeIn>
                  ))}
                </Card>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={buying != null}
        title={buying ? `Buy ${shoppingQuery(buying.name)}` : ''}
        subtitle={
          buying?.quantity
            ? `Recipe needs ${buying.quantity}. Opens the store's app, or its website if the app isn't installed.`
            : "Opens the store's app, or its website if the app isn't installed."
        }
        onClose={() => setBuying(null)}
      >
        <View style={styles.storeList}>
          {stores.map((store) => (
            <PressableScale
              key={store.id}
              onPress={() => buying && buyAt(store, buying)}
              haptic
              scaleTo={0.97}
              style={styles.storeRow}
              accessibilityRole="button"
              accessibilityLabel={`Search ${store.name}`}
            >
              <View style={[styles.storeSwatch, { backgroundColor: store.color }]}>
                <Text style={[styles.storeInitial, { color: store.ink }]}>{store.name[0]}</Text>
              </View>
              <Text style={[type.cardTitle, styles.flex1]}>{store.name}</Text>
              {store.id === lastStore && <Text style={styles.lastUsed}>Last used</Text>}
              <Ionicons name="open-outline" size={18} color={colors.textTertiary} />
            </PressableScale>
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** Fill and tick spring in together, so ticking an item feels like a commit. */
function Checkbox({ checked }: { checked: boolean }) {
  const t = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(t, { toValue: checked ? 1 : 0, ...spring }).start();
  }, [checked, t]);

  return (
    <View style={styles.checkbox}>
      <Animated.View
        style={[
          styles.checkboxFill,
          {
            opacity: t,
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      />
      <Animated.View style={{ opacity: t, transform: [{ scale: t }] }}>
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: SCREEN_PADDING, paddingBottom: 32, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline' },
  progress: { marginTop: 12 },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputWrap: {
    flex: 1,
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  group: { gap: 8 },
  groupTitle: { color: colors.textSecondary, paddingHorizontal: 4 },
  listCard: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  quantity: { marginTop: 2 },
  hint: { paddingHorizontal: 4, lineHeight: 19 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, paddingHorizontal: 4 },
  buyButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  storeList: { gap: 10 },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeSwatch: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInitial: { fontFamily: fonts.bold, fontSize: 17 },
  lastUsed: { fontFamily: fonts.semibold, fontSize: 11, color: colors.success },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
});
