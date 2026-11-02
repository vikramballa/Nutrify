import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  labelAnalysisFromParsed,
  ocrRows,
  parseLabelText,
  type MealPhotoItem,
  type MealType,
  type SavedFood,
} from '@nutrichef/shared';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { Counter, FadeIn, PopIn, PressableScale, easing } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import {
  currentMealType,
  useForgetFood,
  useForgetUsual,
  useLogCustomMeal,
  useSavedFoods,
} from '../hooks/useLogs';
import { useAiConsent } from '../hooks/useAiConsent';
import { BottomSheet } from '../components/BottomSheet';
import {
  useAnalyzeMealPhoto,
  useAnalyzeNutritionLabel,
  useMealScanFeedback,
  type MealPhotoAnalysisResult,
  type NutritionLabelAnalysisResult,
} from '../hooks/useAssistant';
import { recognizeText } from '../ocr/labelOcr';

/** Long edge the photo is downscaled to before upload. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The user's answer to "Is this right?" on a meal scan. Logging options stay
 * hidden while it is 'pending', so a wrong dish isn't logged by accident.
 */
type Verdict = 'pending' | 'yes' | 'corrected';

/** Which scanner is active: a cooked plate (AI estimate) or a packaged label (OCR, ground truth). */
type ScanMode = 'meal' | 'label';

/** Portions the model's "one plate" estimate gets multiplied by. */
const PORTIONS = [0.5, 1, 1.5, 2] as const;

/** Whole servings eaten of a packaged item — labels print per-serving, not per-plate. */
const LABEL_SERVINGS = [1, 2, 3] as const;

/**
 * Gram choices for a label with a per-100 g column (most Indian packs): the
 * printed serving and two of it, 100 g, and the whole pack.
 */
function gramChoices(label: NutritionLabelAnalysisResult): { grams: number; label: string }[] {
  const out: { grams: number; label: string }[] = [];
  const add = (grams: number, text: string) => {
    if (grams > 0 && !out.some((o) => o.grams === grams)) out.push({ grams, label: text });
  };
  const sg = label.servingGrams;
  if (sg && sg !== 100) {
    add(sg, `1 serving · ${sg} g`);
    add(sg * 2, `2 servings · ${sg * 2} g`);
  }
  add(100, '100 g');
  if (label.packGrams) add(label.packGrams, `Whole pack · ${label.packGrams} g`);
  return out;
}

const MACROS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const;

/**
 * A full-res phone photo is 3-6 MB, which is slow to upload and no more
 * legible to the model than 1024px. Resizing client-side keeps the request
 * comfortably under the route's size cap.
 */
async function toDataUrl(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: MAX_EDGE }).renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true,
  });
  if (!saved.base64) throw new Error('encode_failed');
  return `data:image/jpeg;base64,${saved.base64}`;
}

function humanError(mode: ScanMode, err: { status?: number } | null): string {
  switch (err?.status) {
    case 422:
      return mode === 'meal'
        ? "That doesn't look like a meal. Try a clearer photo of the plate."
        : "Couldn't find a nutrition table. Try a closer, well-lit shot of the label.";
    case 413:
      return 'That photo is too large. Try again with a closer shot.';
    case 403:
      return 'Turn on AI features in Settings to scan photos.';
    case 503:
      return 'Photo scanning is unavailable right now. Please try again in a few minutes.';
    case 502:
      return "We couldn't read that photo. Please try again.";
    default:
      return 'Could not analyse that photo. Check your connection and try again.';
  }
}

export function SnapMealScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Scan'>>();
  const aiConsent = useAiConsent();
  const [mode, setMode] = useState<ScanMode>('meal');
  const [photo, setPhoto] = useState<string | null>(null);
  const [mealResult, setMealResult] = useState<MealPhotoAnalysisResult | null>(null);
  const [labelResult, setLabelResult] = useState<NutritionLabelAnalysisResult | null>(null);
  const [portion, setPortion] = useState<number>(1);
  const [mealType, setMealType] = useState<MealType>(currentMealType());
  const [logged, setLogged] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Label scans: the name to log it under, and grams eaten when the label
  // prints per 100 g.
  const [labelName, setLabelName] = useState('');
  const [grams, setGrams] = useState(100);
  const [customGrams, setCustomGrams] = useState('');
  const [reading, setReading] = useState(false);
  // Meal scans: "Is this right?" and the rename dialog behind "No".
  const [verdict, setVerdict] = useState<Verdict>('pending');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [renameNote, setRenameNote] = useState<string | null>(null);
  // Meal scans: whether the user swapped the estimate for their usual portion.
  const [usedUsual, setUsedUsual] = useState(false);
  const savedFoods = useSavedFoods();
  const forgetFood = useForgetFood();
  const forgetUsual = useForgetUsual();
  // Label scans: the barcode this label belongs to, when the user came here
  // because Open Food Facts didn't know it. Saved with the label.
  const [labelBarcode, setLabelBarcode] = useState<string | null>(null);

  const analyzeMeal = useAnalyzeMealPhoto();
  const analyzeLabel = useAnalyzeNutritionLabel();
  const analyze = mode === 'meal' ? analyzeMeal : analyzeLabel;
  const logMeal = useLogCustomMeal();
  const feedback = useMealScanFeedback();

  const result = mode === 'meal' ? mealResult : labelResult;

  const reset = () => {
    setPhoto(null);
    setMealResult(null);
    setLabelResult(null);
    setPortion(1);
    setLogged(false);
    setPickError(null);
    setLabelName('');
    setCustomGrams('');
    setVerdict('pending');
    setRenameOpen(false);
    setRenameText('');
    setRenameNote(null);
    setUsedUsual(false);
    setLabelBarcode(null);
    feedback.reset();
    analyzeMeal.reset();
    analyzeLabel.reset();
    logMeal.reset();
  };

  function switchMode(next: ScanMode) {
    if (next === mode) return;
    setMode(next);
    reset();
  }

  // Sent here from the barcode screen for a product OFF doesn't know: switch
  // to labels and tie the next label logged to that barcode.
  const labelFor = route.params?.labelFor;
  useEffect(() => {
    if (!labelFor) return;
    setMode('label');
    reset();
    setLabelBarcode(labelFor);
    nav.setParams({ labelFor: undefined } as never);
    // reset is recreated every render; only a new barcode should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelFor]);

  /** Long-press on a saved food: remove it from "Your foods". */
  function confirmForget(food: SavedFood) {
    Alert.alert('Remove from your foods?', `${food.name} won't be offered here any more.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => forgetFood.mutate(food.id) },
    ]);
  }

  /** "Forget": stop offering this dish's usual portion. */
  function forgetUsualPortion() {
    if (!mealResult) return;
    forgetUsual.mutate(mealResult.name);
    setUsedUsual(true); // hides the card
  }

  /**
   * A label is read on the phone first (Apple Vision OCR + parseLabelText):
   * exact, offline, and the photo never leaves the device. Only if that can't
   * make sense of it does the photo go to the model, with the OCR text along.
   */
  async function readLabel(uri: string): Promise<NutritionLabelAnalysisResult | null> {
    let ocrText: string | undefined;
    if (recognizeText) {
      setReading(true);
      try {
        const rows = ocrRows(await recognizeText(uri));
        const parsed = parseLabelText(rows);
        if (parsed) return { ...labelAnalysisFromParsed(parsed), provider: 'device' };
        ocrText = rows.join('\n').slice(0, 4000) || undefined;
      } catch {
        // fall through to the model
      } finally {
        setReading(false);
      }
      if (!(await aiConsent.ensure())) {
        setPickError(
          "Couldn't read that label on your phone. Try a closer, flatter shot, or turn on AI features to read it with the assistant.",
        );
        return null;
      }
    }
    return analyzeLabel.mutateAsync({ image: await toDataUrl(uri), ocrText });
  }

  /** A label logged before: shown like a fresh scan, at the amount used last time. */
  function applySavedFood(food: SavedFood) {
    showLabel({ ...food.label, provider: 'saved' });
    setLabelName(food.name);
    if (food.usualGrams) setGrams(food.usualGrams);
    setPortion(food.usualServings ?? 1);
    setLabelBarcode(food.barcode); // logging it again keeps it on its barcode
    setLogged(false);
  }

  /** Swap the photo estimate for the portion the user logged last time. */
  function applyUsualPortion() {
    const usual = mealResult?.usual;
    if (!mealResult || !usual) return;
    setMealResult({
      ...mealResult,
      items: usual.items,
      calories: usual.calories,
      protein: usual.protein,
      carbs: usual.carbs,
      fat: usual.fat,
      note:
        usual.timesEaten > 1
          ? `Your usual portion, as you logged it ${usual.timesEaten} times.`
          : 'The portion you logged last time.',
    });
    setPortion(1);
    setUsedUsual(true);
  }

  function showLabel(label: NutritionLabelAnalysisResult) {
    setLabelResult(label);
    setLabelName(label.productName === 'Packaged food' ? '' : label.productName);
    setGrams(label.servingGrams && label.servingGrams !== 100 ? label.servingGrams : 100);
  }

  async function pick(source: 'camera' | 'library') {
    setPickError(null);
    // Ask before the camera opens, not after the user has framed a shot. A
    // label read on the phone needs no AI, so it asks only if it falls back.
    if ((mode === 'meal' || !recognizeText) && !(await aiConsent.ensure())) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPickError(
        source === 'camera'
          ? 'Camera access is off. Enable it in Settings to scan.'
          : 'Photo access is off. Enable it in Settings to pick a photo.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1, // the resize below compresses; doing it twice just muddies it
    };
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;

    const uri = picked.assets[0].uri;
    setPhoto(uri);
    setMealResult(null);
    setLabelResult(null);
    setLogged(false);
    setVerdict('pending');
    setRenameNote(null);
    setUsedUsual(false);
    try {
      if (mode === 'meal') {
        setMealResult(await analyzeMeal.mutateAsync(await toDataUrl(uri)));
      } else {
        const label = await readLabel(uri);
        if (label) showLabel(label);
      }
      setPortion(1);
    } catch {
      // The active mutation holds the error; the render below reads it.
    }
  }

  /** "Yes, that's it": reinforces a learned name; nothing to wait for. */
  function confirmDish() {
    if (!mealResult) return;
    setVerdict('yes');
    feedback.mutate({ predictedName: mealResult.modelName ?? mealResult.name, correct: true });
  }

  function openRename() {
    setRenameText('');
    feedback.reset();
    setRenameOpen(true);
  }

  /**
   * "No, it's X": the API remembers X against the model's wording (so the
   * next scan it would call the same comes back as X) and re-reads the photo
   * as X so the items and macros match the real dish.
   */
  async function submitRename() {
    const name = renameText.trim();
    if (!mealResult || !name) return;
    let image: string | undefined;
    try {
      if (photo) image = await toDataUrl(photo);
    } catch {
      // Re-encoding failed: still save the lesson, just without re-estimating.
    }
    try {
      const res = await feedback.mutateAsync({
        predictedName: mealResult.modelName ?? mealResult.name,
        correct: false,
        correctName: name,
        image,
      });
      if (res.analysis) {
        setMealResult(res.analysis);
        setRenameNote(`Updated for ${name}. NutriChef will remember this next time.`);
      } else {
        setMealResult({ ...mealResult, name, learned: false });
        setRenameNote(
          `Saved as ${name}, and NutriChef will remember it. The numbers are still the first estimate, so check them.`,
        );
      }
      setVerdict('corrected');
      setRenameOpen(false);
    } catch {
      // The mutation holds the error; the dialog shows it.
    }
  }

  const awaitingVerdict = mode === 'meal' && !!mealResult && verdict === 'pending';

  // Per-100 g labels are logged by grams eaten, everything else by portions.
  const per100 = mode === 'label' ? labelResult?.per100g : undefined;
  const factor = per100 ? grams / 100 : portion;
  const base = per100 ?? result;
  const scaled = base
    ? {
        calories: Math.round(base.calories * factor),
        protein: Math.round(base.protein * factor),
        carbs: Math.round(base.carbs * factor),
        fat: Math.round(base.fat * factor),
      }
    : null;

  function save() {
    if (!result || !scaled) return;
    if (mode === 'meal') {
      const meal = result as MealPhotoAnalysisResult;
      logMeal.mutate(
        {
          name: meal.name,
          mealType,
          // Grams travel as a measure string so the log reads like any other
          // custom meal; `macros` is what actually gets stored.
          items: meal.items.length
            ? meal.items.map((i) => ({
                name: i.name,
                measure: `${Math.round(i.grams * portion)} g`,
              }))
            : [{ name: meal.name, measure: '1 serving' }],
          macros: scaled,
          // The items as eaten: next time this dish is scanned, the app can
          // offer this portion as "your usual".
          scan: meal.items.length ? { items: meal.items.map((i) => scaleItem(i, portion)) } : undefined,
        },
        { onSuccess: () => setLogged(true) },
      );
    } else {
      const label = result as NutritionLabelAnalysisResult;
      const name = labelName.trim() || label.productName;
      logMeal.mutate(
        {
          name,
          mealType,
          items: [{ name, measure: per100 ? `${grams} g` : `${portion} × ${label.servingSize}` }],
          macros: scaled,
          // Saved to "Your foods", with this amount, to log again without the camera.
          label: {
            analysis: label,
            ...(per100 ? { grams } : { servings: portion }),
            ...(labelBarcode ? { barcode: labelBarcode } : {}),
          },
        },
        { onSuccess: () => setLogged(true) },
      );
    }
  }

  const busy = analyze.isPending || reading;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, !photo && !result && styles.contentFill]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <Text style={type.screenTitle}>{mode === 'meal' ? 'Scan a meal' : 'Scan a label'}</Text>
          <Text style={[type.caption, styles.subtitle]}>
            {mode === 'meal'
              ? 'Photograph your plate and the assistant estimates what is on it.'
              : 'Photograph the nutrition table on the pack. It is read right on your phone.'}
          </Text>
        </FadeIn>

        {!photo && !result && (
          <FadeIn delay={40} style={styles.modeRow}>
            <ModeTab
              label="Meal"
              icon="restaurant-outline"
              active={mode === 'meal'}
              onPress={() => switchMode('meal')}
            />
            <ModeTab
              label="Label"
              icon="document-text-outline"
              active={mode === 'label'}
              onPress={() => switchMode('label')}
            />
            {/* Barcodes are exact and instant, so they skip the vision model
                entirely and get their own live-camera screen. */}
            <ModeTab
              label="Barcode"
              icon="barcode-outline"
              active={false}
              onPress={() => nav.navigate('Barcode')}
            />
          </FadeIn>
        )}

        {mode === 'label' && !photo && !result && (savedFoods.data?.foods.length ?? 0) > 0 && (
          <FadeIn delay={60}>
            <Text style={[type.eyebrow, styles.eyebrow]}>YOUR FOODS · NO CAMERA NEEDED</Text>
            <View style={styles.chipRow}>
              {savedFoods.data!.foods.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  active={false}
                  onPress={() => applySavedFood(f)}
                  onLongPress={() => confirmForget(f)}
                />
              ))}
            </View>
            <Text style={[type.caption, styles.captionTop]}>Long-press a food to remove it.</Text>
          </FadeIn>
        )}

        {mode === 'label' && labelBarcode && !logged && (
          <FadeIn delay={50}>
            <View style={styles.barcodeBanner}>
              <Ionicons name="barcode-outline" size={18} color={colors.primary} />
              <Text style={[type.caption, styles.flex1]}>
                Scanning the label for barcode {labelBarcode}. NutriChef will remember it, so your next scan
                of this barcode just works.
              </Text>
            </View>
          </FadeIn>
        )}

        {photo ? (
          <PopIn>
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo }} style={styles.photo} />
              {busy && <ScanOverlay text={mode === 'meal' ? 'Reading your plate…' : 'Reading the label…'} />}
              {!busy && (
                <PressableScale
                  onPress={reset}
                  scaleTo={0.9}
                  style={styles.retakeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Discard photo and scan another"
                >
                  <Ionicons name="close" size={18} color={colors.textPrimary} />
                </PressableScale>
              )}
            </View>
          </PopIn>
        ) : !result ? (
          <FadeIn delay={80} style={styles.flex1}>
            <EmptyDropZone mode={mode} />
          </FadeIn>
        ) : (
          // A saved food opened without a photo: offer the camera instead.
          <PressableScale onPress={reset} style={styles.scanInstead} accessibilityRole="button">
            <Ionicons name="camera-outline" size={16} color={colors.primary} />
            <Text style={styles.renameLink}>Scan a label instead</Text>
          </PressableScale>
        )}

        {!result && !busy && (
          <FadeIn delay={140} style={styles.actionRow}>
            <PressableScale
              onPress={() => pick('camera')}
              haptic
              style={[styles.bigButton, styles.bigButtonPrimary]}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={[styles.bigButtonLabel, styles.onPrimary]}>Take photo</Text>
            </PressableScale>
            <PressableScale
              onPress={() => pick('library')}
              style={[styles.bigButton, styles.bigButtonSecondary]}
            >
              <Ionicons name="images-outline" size={20} color={colors.primary} />
              <Text style={[styles.bigButtonLabel, styles.onSecondary]}>Gallery</Text>
            </PressableScale>
          </FadeIn>
        )}

        {pickError && <Notice tone="warn" text={pickError} />}
        {analyze.isError && !busy && (
          <Notice tone="error" text={humanError(mode, analyze.error)} />
        )}

        {result && scaled && (
          <>
            <FadeIn delay={60}>
              <Card style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={styles.flex1}>
                    {mode === 'meal' ? (
                      <Text style={type.sectionHeader}>{(result as MealPhotoAnalysisResult).name}</Text>
                    ) : (
                      <TextInput
                        value={labelName}
                        onChangeText={setLabelName}
                        placeholder="Name this food (e.g. Marie biscuits)"
                        placeholderTextColor={colors.textTertiary}
                        maxLength={80}
                        style={[type.sectionHeader, styles.nameInput]}
                        accessibilityLabel="Food name"
                      />
                    )}
                    {mode === 'meal' && mealResult?.learned && (
                      <View style={styles.learnedRow}>
                        <Ionicons name="school-outline" size={12} color={colors.primary} />
                        <Text style={styles.learnedText}>Named from your earlier correction</Text>
                      </View>
                    )}
                    <Text style={[type.caption, styles.captionTop]}>
                      {mode === 'meal'
                        ? `Estimated for ${portion === 1 ? 'the plate shown' : `${portion}× the plate`}`
                        : per100
                          ? `${grams} g · printed per 100 g`
                          : `${(result as NutritionLabelAnalysisResult).servingSize} · ${portion} serving${portion === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  {mode === 'meal' ? (
                    <ConfidencePill value={(result as MealPhotoAnalysisResult).confidence} />
                  ) : (
                    <View style={[styles.pill, styles.pillHigh]}>
                      <Ionicons
                        name={
                          labelResult?.provider === 'saved'
                            ? 'bookmark-outline'
                            : labelResult?.source === 'device'
                              ? 'phone-portrait-outline'
                              : 'checkmark-done'
                        }
                        size={12}
                        color={colors.success}
                      />
                      <Text style={[styles.pillText, { color: colors.success }]}>
                        {labelResult?.provider === 'saved'
                          ? 'Saved food'
                          : labelResult?.source === 'device'
                            ? 'Read on phone'
                            : 'From label'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.macroRow}>
                  {MACROS.map((m, i) => (
                    <View key={m.key} style={styles.macroItem}>
                      <Counter
                        value={scaled[m.key]}
                        delay={i * 70}
                        style={type.statNumber}
                        format={(n) => `${n}${m.unit}`}
                      />
                      <Text style={[type.caption, styles.macroLabel]}>{m.label}</Text>
                    </View>
                  ))}
                </View>

                {result.note ? (
                  <View style={styles.noteRow}>
                    <Ionicons
                      name="information-circle-outline"
                      size={15}
                      color={colors.textTertiary}
                    />
                    <Text style={[type.caption, styles.flex1]}>{result.note}</Text>
                  </View>
                ) : null}
              </Card>
            </FadeIn>

            {mode === 'meal' && mealResult && (
              <FadeIn delay={90}>
                {verdict === 'pending' ? (
                  <Card style={styles.verdictCard}>
                    <Text style={type.body}>
                      Is this <Text style={styles.verdictName}>{mealResult.name}</Text>?
                    </Text>
                    <View style={styles.verdictRow}>
                      <PressableScale
                        onPress={confirmDish}
                        haptic
                        style={[styles.verdictButton, styles.verdictYes]}
                        accessibilityRole="button"
                        accessibilityLabel="Yes, the dish is correct"
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={[styles.verdictLabel, styles.onPrimary]}>Yes</Text>
                      </PressableScale>
                      <PressableScale
                        onPress={openRename}
                        style={[styles.verdictButton, styles.verdictNo]}
                        accessibilityRole="button"
                        accessibilityLabel="No, the dish is wrong"
                      >
                        <Ionicons name="close" size={18} color={colors.primary} />
                        <Text style={[styles.verdictLabel, styles.onSecondary]}>No</Text>
                      </PressableScale>
                    </View>
                  </Card>
                ) : (
                  <View style={styles.verdictDone}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={[type.caption, styles.flex1]}>
                      {verdict === 'yes' ? 'Dish confirmed.' : renameNote}
                    </Text>
                    <PressableScale onPress={openRename} accessibilityRole="button">
                      <Text style={styles.renameLink}>Rename</Text>
                    </PressableScale>
                  </View>
                )}
              </FadeIn>
            )}

            {!awaitingVerdict && (
            <>
            {mode === 'meal' && mealResult?.usual && !usedUsual && !logged && (
              <FadeIn delay={100}>
                <Card style={styles.usualCard}>
                  <View style={styles.flex1}>
                    <Text style={type.eyebrow}>
                      {mealResult.usual.timesEaten > 1 ? 'YOUR USUAL' : 'LAST TIME'}
                    </Text>
                    <Text style={[type.body, styles.captionTop]} numberOfLines={2}>
                      {usualSummary(mealResult.usual.items)} · {mealResult.usual.calories} cal
                    </Text>
                  </View>
                  <View style={styles.usualActions}>
                    <PressableScale
                      onPress={applyUsualPortion}
                      style={styles.usualButton}
                      accessibilityRole="button"
                      accessibilityLabel="Use my usual portion"
                    >
                      <Text style={styles.renameLink}>Use it</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={forgetUsualPortion}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Forget my usual portion of this dish"
                    >
                      <Text style={styles.forgetLink}>Forget</Text>
                    </PressableScale>
                  </View>
                </Card>
              </FadeIn>
            )}
            <FadeIn delay={110}>
              <Text style={[type.eyebrow, styles.eyebrow]}>HOW MUCH DID YOU EAT</Text>
              <View style={styles.chipRow}>
                {per100 && labelResult
                  ? (
                    <>
                      {gramChoices(labelResult).map((c) => (
                        <Chip
                          key={c.grams}
                          label={c.label}
                          active={c.grams === grams && !customGrams}
                          onPress={() => {
                            setGrams(c.grams);
                            setCustomGrams('');
                          }}
                        />
                      ))}
                      <View style={[styles.chip, styles.gramInputWrap, customGrams ? styles.chipActive : null]}>
                        <TextInput
                          value={customGrams}
                          onChangeText={(t) => {
                            const clean = t.replace(/[^0-9]/g, '').slice(0, 4);
                            setCustomGrams(clean);
                            if (Number(clean) > 0) setGrams(Number(clean));
                          }}
                          placeholder="Other"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="number-pad"
                          style={[styles.chipText, styles.gramInput, customGrams ? styles.chipTextActive : null]}
                          accessibilityLabel="Grams eaten"
                        />
                        <Text style={[styles.chipText, customGrams ? styles.chipTextActive : null]}>g</Text>
                      </View>
                    </>
                  )
                  : mode === 'meal'
                  ? PORTIONS.map((p) => (
                      <Chip
                        key={p}
                        label={p === 1 ? 'All of it' : `${p}×`}
                        active={p === portion}
                        onPress={() => setPortion(p)}
                      />
                    ))
                  : LABEL_SERVINGS.map((s) => (
                      <Chip
                        key={s}
                        label={s === 1 ? '1 serving' : `${s} servings`}
                        active={s === portion}
                        onPress={() => setPortion(s)}
                      />
                    ))}
              </View>
            </FadeIn>

            <FadeIn delay={150}>
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

            {mode === 'meal' && (result as MealPhotoAnalysisResult).items.length > 0 && (
              <FadeIn delay={190}>
                <Text style={[type.eyebrow, styles.eyebrow]}>WHAT IT SPOTTED</Text>
                <Card style={styles.itemsCard}>
                  {(result as MealPhotoAnalysisResult).items.map((item, i, items) => (
                    <FadeIn key={`${item.name}-${i}`} index={i} offset={8}>
                      <View style={[styles.itemRow, i < items.length - 1 && styles.itemRowDivider]}>
                        <View style={[styles.itemDot, item.matched === false && styles.itemDotEstimate]} />
                        <Text style={[type.body, styles.flex1]} numberOfLines={1}>
                          {item.count ? `${Math.round(item.count * portion * 10) / 10} × ` : ''}
                          {item.name}
                        </Text>
                        <Text style={type.caption}>
                          {Math.round(item.grams * portion)} g
                          {item.calories != null ? ` · ${Math.round(item.calories * portion)} cal` : ''}
                        </Text>
                      </View>
                    </FadeIn>
                  ))}
                </Card>
                {(result as MealPhotoAnalysisResult).items.some((i) => i.matched === false) && (
                  <View style={styles.legendRow}>
                    <View style={[styles.itemDot, styles.itemDotEstimate]} />
                    <Text style={[type.caption, styles.flex1]}>
                      The assistant's estimate. Everything else is from our Indian and USDA food tables.
                    </Text>
                  </View>
                )}
              </FadeIn>
            )}

            <FadeIn delay={230}>
              <PressableScale
                onPress={save}
                haptic
                disabled={logMeal.isPending || logged}
                style={[styles.saveButton, logged && styles.saveButtonDone]}
              >
                {logMeal.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={logged ? 'checkmark-circle' : 'add-circle'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.saveLabel}>
                      {logged ? 'Logged' : `Log ${scaled.calories} cal`}
                    </Text>
                  </>
                )}
              </PressableScale>
              {logged && (
                <PressableScale onPress={reset} style={styles.againButton}>
                  <Text style={styles.againLabel}>Scan another meal</Text>
                </PressableScale>
              )}
              {logMeal.isError && (
                <Notice tone="error" text="Could not log that meal. Try again." />
              )}
            </FadeIn>
            </>
            )}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={renameOpen}
        title="What is this dish?"
        subtitle="Type the right name. NutriChef re-checks the photo and remembers it for your next scan."
        onClose={() => !feedback.isPending && setRenameOpen(false)}
      >
        <TextInput
          value={renameText}
          onChangeText={setRenameText}
          placeholder="e.g. Gongura chicken"
          placeholderTextColor={colors.textTertiary}
          maxLength={80}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submitRename}
          editable={!feedback.isPending}
          style={styles.renameInput}
          accessibilityLabel="Correct dish name"
        />
        {feedback.isError && (
          <Notice tone="error" text="Couldn't save that. Check your connection and try again." />
        )}
        <PressableScale
          onPress={submitRename}
          haptic
          disabled={!renameText.trim() || feedback.isPending}
          style={[styles.saveButton, !renameText.trim() && styles.saveButtonDisabled]}
        >
          {feedback.isPending ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.saveLabel}>Re-checking the photo…</Text>
            </>
          ) : (
            <Text style={styles.saveLabel}>Save name</Text>
          )}
        </PressableScale>
      </BottomSheet>
    </Screen>
  );
}

/** A photo item scaled to the portion eaten, for remembering as "your usual". */
function scaleItem(i: MealPhotoItem, portion: number): MealPhotoItem {
  const r = (n: number | undefined) => (n == null ? undefined : Math.round(n * portion));
  return {
    name: i.name,
    grams: Math.round(i.grams * portion),
    ...(i.count ? { count: Math.min(50, Math.max(1, Math.round(i.count * portion))) } : {}),
    ...(i.calories != null ? { calories: r(i.calories), protein: r(i.protein), carbs: r(i.carbs), fat: r(i.fat) } : {}),
    ...(i.matched != null ? { matched: i.matched } : {}),
  };
}

/** "3 idli, sambar, chutney" */
function usualSummary(items: MealPhotoItem[]): string {
  return items.map((i) => (i.count ? `${i.count} ${i.name}` : i.name)).join(', ');
}

/** Idle state: a dashed frame with a slowly breathing scan glyph. */
function EmptyDropZone({ mode }: { mode: ScanMode }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1600,
          easing: easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1600,
          easing: easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  return (
    <View style={styles.dropZone}>
      <Animated.View
        style={[
          styles.dropZoneIcon,
          {
            transform: [
              { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          },
        ]}
      >
        <Ionicons name="scan-outline" size={40} color={colors.primary} />
      </Animated.View>
      <Text style={[type.cardTitle, styles.dropZoneTitle]}>
        {mode === 'meal' ? 'Point at your plate' : 'Point at the label'}
      </Text>
      <Text style={[type.caption, styles.dropZoneBody]}>
        {mode === 'meal'
          ? 'Works best with the whole meal in frame, shot from above.'
          : 'Fill the frame with the nutrition table, flat and well lit.'}
      </Text>
    </View>
  );
}

/** A scan line sweeping the photo while it is read. */
function ScanOverlay({ text }: { text: string }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1500,
        easing: easing.standard,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  return (
    <View style={styles.scanOverlay} pointerEvents="none">
      <Animated.View
        style={[
          styles.scanLine,
          {
            opacity: sweep.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 260] }) },
            ],
          },
        ]}
      />
      <View style={styles.scanLabel}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={styles.scanLabelText}>{text}</Text>
      </View>
    </View>
  );
}

function ConfidencePill({ value }: { value: number }) {
  // Below ~60% the estimate is a guess; say so rather than dressing it up.
  const low = value < 0.6;
  return (
    <View style={[styles.pill, low ? styles.pillLow : styles.pillHigh]}>
      <Ionicons
        name={low ? 'help-circle-outline' : 'sparkles'}
        size={12}
        color={low ? colors.highlightText : colors.success}
      />
      <Text style={[styles.pillText, { color: low ? colors.highlightText : colors.success }]}>
        {Math.round(value * 100)}% sure
      </Text>
    </View>
  );
}

function ModeTab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.modeTab, active && styles.modeTabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={16} color={active ? '#fff' : colors.textSecondary} />
      <Text style={[styles.modeTabLabel, active && styles.modeTabLabelActive]}>{label}</Text>
    </PressableScale>
  );
}

function Chip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.94}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

function Notice({ tone, text }: { tone: 'error' | 'warn'; text: string }) {
  const error = tone === 'error';
  return (
    <FadeIn offset={6}>
      <View style={[styles.notice, error ? styles.noticeError : styles.noticeWarn]}>
        <Ionicons
          name={error ? 'alert-circle' : 'lock-closed-outline'}
          size={16}
          color={error ? colors.danger : colors.highlightText}
        />
        <Text style={[styles.noticeText, { color: error ? colors.danger : colors.highlightText }]}>
          {text}
        </Text>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, paddingBottom: 40, gap: 16 },
  contentFill: { flexGrow: 1 },
  flex1: { flex: 1 },
  subtitle: { marginTop: 4 },
  captionTop: { marginTop: 3 },
  eyebrow: { marginBottom: 10 },
  onPrimary: { color: '#fff' },
  onSecondary: { color: colors.primary },

  dropZone: {
    flex: 1,
    minHeight: 220,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
  },
  dropZoneIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneTitle: { marginTop: 2 },
  dropZoneBody: { textAlign: 'center' },

  photoWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  photo: { width: '100%', height: 280 },
  retakeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,14,10,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  scanLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,14,10,0.7)',
  },
  scanLabelText: { fontFamily: fonts.semibold, fontSize: 13, color: '#fff' },

  modeRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radii.pill,
  },
  modeTabActive: { backgroundColor: colors.primary },
  modeTabLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  modeTabLabelActive: { color: '#fff', fontFamily: fonts.semibold },

  actionRow: { flexDirection: 'row', gap: 12 },
  bigButton: {
    flex: 1,
    height: 54,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bigButtonPrimary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bigButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  bigButtonLabel: { fontFamily: fonts.semibold, fontSize: 15 },

  resultCard: { padding: 20, gap: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroItem: { alignItems: 'center' },
  macroLabel: { marginTop: 2 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  pillHigh: { backgroundColor: colors.successLight },
  pillLow: { backgroundColor: colors.highlight },
  pillText: { fontFamily: fonts.semibold, fontSize: 11 },

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
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontFamily: fonts.semibold },

  itemsCard: { paddingHorizontal: 16, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  itemDotEstimate: { backgroundColor: colors.textTertiary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 },
  nameInput: { paddingVertical: 0 },
  gramInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
  gramInput: { minWidth: 44, paddingVertical: 2, textAlign: 'right' },

  saveButton: {
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
  saveButtonDone: { backgroundColor: colors.success, shadowOpacity: 0 },
  saveButtonDisabled: { opacity: 0.5 },

  verdictCard: { padding: 16, gap: 12 },
  verdictName: { fontFamily: fonts.semibold, color: colors.textPrimary },
  verdictRow: { flexDirection: 'row', gap: 10 },
  verdictButton: {
    flex: 1,
    height: 46,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  verdictYes: { backgroundColor: colors.primary },
  verdictNo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryLight },
  verdictLabel: { fontFamily: fonts.semibold, fontSize: 15 },
  verdictDone: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  renameLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  renameInput: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  usualActions: { alignItems: 'center', gap: 6 },
  forgetLink: { fontFamily: fonts.medium, fontSize: 12, color: colors.textTertiary },
  barcodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  usualCard: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  usualButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  scanInstead: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  learnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  learnedText: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  saveLabel: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
  againButton: { alignItems: 'center', paddingVertical: 14 },
  againLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 13,
    borderRadius: radii.md,
  },
  noticeError: { backgroundColor: colors.dangerLight },
  noticeWarn: { backgroundColor: colors.highlight },
  noticeText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
});
