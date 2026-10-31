import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { labelAnalysisFromParsed, ocrRows, parseLabelText, type MealType } from '@nutrichef/shared';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { SCREEN_PADDING, fonts, radii, type } from '../theme/typography';
import { Counter, FadeIn, PopIn, PressableScale, easing } from '../theme/motion';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { useLogCustomMeal, currentMealType } from '../hooks/useLogs';
import { useAiConsent } from '../hooks/useAiConsent';
import {
  useAnalyzeMealPhoto,
  useAnalyzeNutritionLabel,
  type MealPhotoAnalysisResult,
  type NutritionLabelAnalysisResult,
} from '../hooks/useAssistant';
import { recognizeText } from '../ocr/labelOcr';

/** Long edge the photo is downscaled to before upload. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

  const analyzeMeal = useAnalyzeMealPhoto();
  const analyzeLabel = useAnalyzeNutritionLabel();
  const analyze = mode === 'meal' ? analyzeMeal : analyzeLabel;
  const logMeal = useLogCustomMeal();

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
    analyzeMeal.reset();
    analyzeLabel.reset();
    logMeal.reset();
  };

  function switchMode(next: ScanMode) {
    if (next === mode) return;
    setMode(next);
    reset();
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
        ) : (
          <FadeIn delay={80} style={styles.flex1}>
            <EmptyDropZone mode={mode} />
          </FadeIn>
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
                        name={labelResult?.source === 'device' ? 'phone-portrait-outline' : 'checkmark-done'}
                        size={12}
                        color={colors.success}
                      />
                      <Text style={[styles.pillText, { color: colors.success }]}>
                        {labelResult?.source === 'device' ? 'Read on phone' : 'From label'}
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
      </ScrollView>
    </Screen>
  );
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
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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
