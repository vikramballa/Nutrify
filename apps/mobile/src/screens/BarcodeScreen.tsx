import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { FoodProduct, MealType } from '@nutrichef/shared';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { Counter, FadeIn, PressableScale } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { currentMealType, useBarcodeProduct, useLogBarcode } from '../hooks/useLogs';
import type { ApiError } from '../api/client';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
// Retail symbologies only — QR codes on packaging are marketing links.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const GRAM_PRESETS = [30, 50, 100, 150, 200];
const SERVING_PRESETS = [0.5, 1, 1.5, 2];

const MACROS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const;

/** Display-only; the API recomputes the stored macros from the same product. */
function macrosFor(p: FoodProduct, grams: number) {
  const f = grams / 100;
  return {
    calories: Math.round(p.per100g.calories * f),
    protein: Math.round(p.per100g.protein * f),
    carbs: Math.round(p.per100g.carbs * f),
    fat: Math.round(p.per100g.fat * f),
  };
}

function lookupError(err: ApiError | null): string {
  switch (err?.status) {
    case 404:
      return "This product isn't in Open Food Facts yet, or has no calories listed. Try scanning the nutrition label instead.";
    case 400:
      return "That doesn't look like a product barcode. Check the digits and try again.";
    case 503:
      return 'The food database is unreachable right now. Try again in a minute.';
    default:
      return 'Could not look up that barcode. Check your connection and try again.';
  }
}

export function BarcodeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [grams, setGrams] = useState<number | null>(null);
  const [customGrams, setCustomGrams] = useState('');
  const [mealType, setMealType] = useState<MealType>(currentMealType());
  const [logged, setLogged] = useState(false);
  // The camera fires many times per second while a code is in frame.
  const handled = useRef(false);

  const product = useBarcodeProduct(barcode);
  const logBarcode = useLogBarcode();

  const p = product.data;
  // Default amount: one declared serving, else 100 g.
  const amount = grams ?? p?.servingGrams ?? 100;
  const macros = p ? macrosFor(p, amount) : null;

  function onScanned(result: BarcodeScanningResult) {
    if (handled.current || !/^\d{8,14}$/.test(result.data)) return;
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBarcode(result.data);
  }

  function lookUpManual() {
    const code = manual.replace(/\D/g, '');
    if (code.length < 8) return;
    handled.current = true;
    setBarcode(code);
  }

  function reset() {
    handled.current = false;
    setBarcode(null);
    setManual('');
    setGrams(null);
    setCustomGrams('');
    setLogged(false);
    logBarcode.reset();
  }

  function applyCustom(text: string) {
    setCustomGrams(text);
    const n = parseFloat(text);
    if (!Number.isNaN(n) && n > 0 && n <= 3000) setGrams(n);
  }

  function save() {
    if (!barcode || !p) return;
    logBarcode.mutate(
      { barcode, grams: amount, mealType },
      { onSuccess: () => setLogged(true) },
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // The keyboard otherwise covers the lower fields and the save button.
        automaticallyAdjustKeyboardInsets
      >
        {barcode == null && (
          <>
            <FadeIn>
              <Text style={[type.caption, styles.subtitle]}>
                Point the camera at the barcode on the pack. Exact per-100g values from Open Food
                Facts, no photo analysis needed.
              </Text>
            </FadeIn>

            <View style={styles.cameraWrap}>
              {permission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                  onBarcodeScanned={onScanned}
                />
              ) : (
                <View style={styles.cameraPlaceholder}>
                  <Ionicons name="barcode-outline" size={42} color={colors.primary} />
                  <Text style={[type.caption, styles.center]}>
                    {permission?.canAskAgain === false
                      ? 'Camera access is off. Enable it in Settings, or type the number below.'
                      : 'Camera access is needed to scan barcodes.'}
                  </Text>
                  {permission?.canAskAgain !== false && (
                    <PressableScale onPress={requestPermission} style={styles.smallButton}>
                      <Text style={styles.smallButtonLabel}>Allow camera</Text>
                    </PressableScale>
                  )}
                </View>
              )}
              {permission?.granted && <View style={styles.reticle} pointerEvents="none" />}
            </View>

            <Text style={type.eyebrow}>OR TYPE THE NUMBER</Text>
            <View style={styles.manualRow}>
              <TextInput
                value={manual}
                onChangeText={setManual}
                placeholder="e.g. 3017620422003"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                returnKeyType="search"
                onSubmitEditing={lookUpManual}
                maxLength={14}
                style={styles.input}
              />
              <PressableScale
                onPress={lookUpManual}
                disabled={manual.replace(/\D/g, '').length < 8}
                style={[styles.lookupButton, manual.replace(/\D/g, '').length < 8 && styles.dim]}
                accessibilityLabel="Look up barcode"
              >
                <Ionicons name="search" size={20} color="#fff" />
              </PressableScale>
            </View>
          </>
        )}

        {barcode != null && product.isLoading && (
          <Card style={styles.centerCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={type.caption}>Looking up {barcode}…</Text>
          </Card>
        )}

        {barcode != null && product.isError && (
          <FadeIn>
            <Card style={styles.centerCard}>
              <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
              <Text style={[type.body, styles.center]}>
                {lookupError(product.error as ApiError)}
              </Text>
              <PressableScale onPress={reset} style={styles.smallButton}>
                <Text style={styles.smallButtonLabel}>Scan another</Text>
              </PressableScale>
            </Card>
          </FadeIn>
        )}

        {p && macros && (
          <>
            <FadeIn>
              <Card style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={styles.flex1}>
                    <Text style={type.sectionHeader}>{p.name}</Text>
                    <Text style={[type.caption, styles.captionTop]}>
                      {[p.brand, `${Math.round(p.per100g.calories)} cal / 100 g`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.pill}>
                    <Ionicons name="checkmark-done" size={12} color={colors.success} />
                    <Text style={styles.pillText}>Barcode</Text>
                  </View>
                </View>
                <View style={styles.macroRow}>
                  {MACROS.map((m, i) => (
                    <View key={m.key} style={styles.macroItem}>
                      <Counter
                        value={macros[m.key]}
                        delay={i * 70}
                        style={type.statNumber}
                        format={(n) => `${n}${m.unit}`}
                      />
                      <Text style={[type.caption, styles.captionTop]}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeIn>

            <FadeIn delay={80}>
              <Text style={[type.eyebrow, styles.eyebrow]}>HOW MUCH · {Math.round(amount)} g</Text>
              <View style={styles.chipRow}>
                {p.servingGrams
                  ? SERVING_PRESETS.map((s) => {
                      const g = Math.round(p.servingGrams! * s * 10) / 10;
                      return (
                        <Chip
                          key={s}
                          label={s === 1 ? `1 serving (${g} g)` : `${s} servings`}
                          active={amount === g && !customGrams}
                          onPress={() => {
                            setCustomGrams('');
                            setGrams(g);
                          }}
                        />
                      );
                    })
                  : GRAM_PRESETS.map((g) => (
                      <Chip
                        key={g}
                        label={`${g} g`}
                        active={amount === g && !customGrams}
                        onPress={() => {
                          setCustomGrams('');
                          setGrams(g);
                        }}
                      />
                    ))}
                <TextInput
                  value={customGrams}
                  onChangeText={applyCustom}
                  placeholder="Other g"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  style={[styles.chip, styles.chipInput, customGrams !== '' && styles.chipActiveBorder]}
                />
              </View>
            </FadeIn>

            <FadeIn delay={120}>
              <Text style={[type.eyebrow, styles.eyebrow]}>WHEN</Text>
              <View style={styles.chipRow}>
                {MEAL_TYPES.map((m) => (
                  <Chip
                    key={m}
                    label={m[0].toUpperCase() + m.slice(1)}
                    active={m === mealType}
                    onPress={() => setMealType(m)}
                  />
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <PressableScale
                onPress={save}
                haptic
                disabled={logBarcode.isPending || logged}
                style={[styles.saveButton, logged && styles.saveButtonDone]}
              >
                {logBarcode.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={logged ? 'checkmark-circle' : 'add-circle'} size={20} color="#fff" />
                    <Text style={styles.saveLabel}>
                      {logged ? 'Logged' : `Log ${macros.calories} cal`}
                    </Text>
                  </>
                )}
              </PressableScale>
              {logBarcode.isError && (
                <Text style={[type.caption, styles.errorText]}>Could not log that. Try again.</Text>
              )}
              <PressableScale onPress={reset} style={styles.againButton}>
                <Text style={styles.againLabel}>{logged ? 'Scan another' : 'Wrong product? Rescan'}</Text>
              </PressableScale>
            </FadeIn>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, paddingBottom: 40, gap: 16 },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  subtitle: { marginTop: 2 },
  captionTop: { marginTop: 3 },
  eyebrow: { marginBottom: 10 },
  dim: { opacity: 0.5 },

  cameraWrap: {
    height: 280,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 30,
    backgroundColor: colors.primarySoft,
  },
  reticle: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '32%',
    bottom: '32%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.md,
  },

  manualRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lookupButton: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  smallButtonLabel: { fontFamily: fonts.semibold, fontSize: 14, color: '#fff' },

  centerCard: { padding: 24, alignItems: 'center', gap: 12 },
  resultCard: { padding: 20, gap: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroItem: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.successLight,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.success },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipActiveBorder: { borderColor: colors.primary },
  chipInput: {
    minWidth: 84,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontFamily: fonts.semibold },

  saveButton: {
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDone: { backgroundColor: colors.success },
  saveLabel: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 8 },
  againButton: { alignItems: 'center', paddingVertical: 14 },
  againLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
});
