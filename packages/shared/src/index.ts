import { z } from 'zod';

/** Ingredient as stored/returned by the API. */
export const IngredientSchema = z.object({
  name: z.string(),
  measure: z.string(),
  position: z.number().int(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeSourceSchema = z.enum(['MEALDB', 'AI']);
export type RecipeSource = z.infer<typeof RecipeSourceSchema>;

/** Full recipe DTO returned by the API. */
export const RecipeSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  name: z.string(),
  category: z.string(),
  cuisine: z.string(),
  imageUrl: z.string().nullable(),
  instructions: z.string(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  source: RecipeSourceSchema,
  // Real per-serving nutrition when computed (USDA-backed), else null.
  calories: z.number().int().nullable(),
  protein: z.number().int().nullable(),
  carbs: z.number().int().nullable(),
  fat: z.number().int().nullable(),
  // Estimated from total ingredient weight — sources carry no serving count.
  // The per-serving macros above are divided by this.
  servings: z.number().int().nullable(),
  ingredients: z.array(IngredientSchema),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeNutritionSchema = z.object({
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
  perServing: z.literal(true),
  servings: z.number().int(),
});
export type RecipeNutrition = z.infer<typeof RecipeNutritionSchema>;

export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof MealTypeSchema>;

export const MealLogSchema = z.object({
  id: z.string(),
  recipeId: z.string().nullable(),
  name: z.string(),
  mealType: MealTypeSchema,
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
  at: z.string(), // ISO datetime
});
export type MealLog = z.infer<typeof MealLogSchema>;

// One line of a custom meal: "Rice" / "200g", "Chicken curry" / "300g".
export const CustomLogItemSchema = z.object({
  name: z.string().min(1).max(200),
  measure: z.string().min(1).max(100),
});
export type CustomLogItem = z.infer<typeof CustomLogItemSchema>;

// Ceilings well past any real plate, so a typo can't poison a week of totals.
export const MacrosSchema = z.object({
  calories: z.number().int().nonnegative().max(20_000),
  protein: z.number().int().nonnegative().max(2_000),
  carbs: z.number().int().nonnegative().max(2_000),
  fat: z.number().int().nonnegative().max(2_000),
});
export type Macros = z.infer<typeof MacrosSchema>;

// Log a meal that isn't a saved recipe — the API computes macros from the
// items, unless `macros` is supplied (the photo scanner already estimated
// them from the picture, which beats re-deriving them from item names).
// Items share the preview's cap of 30: each unknown one can cost a USDA call.
export const CreateCustomLogSchema = z.object({
  name: z.string().min(1).max(200),
  mealType: MealTypeSchema,
  items: z.array(CustomLogItemSchema).min(1).max(30),
  macros: MacrosSchema.optional(),
});
export type CreateCustomLog = z.infer<typeof CreateCustomLogSchema>;

export const TodayLogsResponseSchema = z.object({
  logs: z.array(MealLogSchema),
  totals: z.object({
    calories: z.number().int(),
    protein: z.number().int(),
    carbs: z.number().int(),
    fat: z.number().int(),
  }),
});
export type TodayLogsResponse = z.infer<typeof TodayLogsResponseSchema>;

// ---------------------------------------------------------------------------
// Streaks — logging habit, not goal adherence. The behaviour we want to
// reinforce is opening the app and logging, which the user controls; whether
// they hit their macros on a given day, they largely do not.
// ---------------------------------------------------------------------------

export const StreakDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  logged: z.boolean(),
});
export type StreakDay = z.infer<typeof StreakDaySchema>;

export const StreakSummarySchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  loggedToday: z.boolean(),
  /** The run survives only because a missed day is being forgiven. */
  forgiving: z.boolean(),
  week: z.array(StreakDaySchema),
});
export type StreakSummary = z.infer<typeof StreakSummarySchema>;

// ---------------------------------------------------------------------------
// Recent meals — one-tap re-log. People eat the same handful of things, so
// repeating yesterday's lunch should not cost a search.
// ---------------------------------------------------------------------------

export const RecentMealSchema = z.object({
  /** The MealLog this was taken from; POST /logs/repeat copies it server-side. */
  logId: z.string(),
  name: z.string(),
  mealType: MealTypeSchema,
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
  lastLoggedAt: z.string(), // ISO datetime
});
export type RecentMeal = z.infer<typeof RecentMealSchema>;

export const RecentMealsResponseSchema = z.object({ meals: z.array(RecentMealSchema) });
export type RecentMealsResponse = z.infer<typeof RecentMealsResponseSchema>;

/** Re-log a previous meal. Macros are copied from the stored row, never sent
 *  by the client, so a tampered body cannot invent nutrition. */
export const RepeatLogSchema = z.object({
  logId: z.string().min(1),
  mealType: MealTypeSchema.optional(),
  servings: z.number().min(0.25).max(10).optional(),
});
export type RepeatLog = z.infer<typeof RepeatLogSchema>;

/** Raw meal timestamps, used only to learn when to send reminders. */
export const MealTimesResponseSchema = z.object({
  times: z.array(z.object({ mealType: z.string(), at: z.string() })),
});
export type MealTimesResponse = z.infer<typeof MealTimesResponseSchema>;

export const SearchSourceSchema = z.enum(['cache', 'mealdb', 'ai', 'none']);
export type SearchSource = z.infer<typeof SearchSourceSchema>;

export const SearchResponseSchema = z.object({
  recipes: z.array(RecipeSchema),
  source: SearchSourceSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Why a recipe was recommended: the strongest taste tokens it matched. Empty
 * means it came from the exploration slice rather than the profile.
 */
export const RecommendationsResponseSchema = z.object({
  recipes: z.array(RecipeSchema),
  personalized: z.boolean(),
  reasons: z.record(z.string(), z.array(z.string())).optional(),
});
export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;

export const InsightsResponseSchema = z.object({
  content: z.string(),
  provider: z.string(),
});
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

export const ChatRoleSchema = z.enum(['user', 'assistant']);

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string(), // ISO-8601
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Whole thread, oldest first. */
export const ChatHistorySchema = z.object({ messages: z.array(ChatMessageSchema) });
export type ChatHistory = z.infer<typeof ChatHistorySchema>;

/** A turn that produced an answer: both persisted rows plus the provider used. */
export const ChatTurnSchema = z.object({
  message: ChatMessageSchema,
  reply: ChatMessageSchema,
  provider: z.string(),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const NutritionGoalsSchema = z.object({
  calories: z.number().int(),
  carbs: z.number().int(),
  protein: z.number().int(),
  fat: z.number().int(),
});
export type NutritionGoals = z.infer<typeof NutritionGoalsSchema>;

export const SexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof SexSchema>;

export const ActivityLevelSchema = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const GoalSchema = z.enum(['lose_weight', 'maintain', 'gain_weight', 'build_muscle']);
export type Goal = z.infer<typeof GoalSchema>;

export const ConditionSchema = z.enum([
  'diabetes',
  'hypertension',
  'high_cholesterol',
  'thyroid',
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** Onboarding / settings questionnaire answers. */
export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  goal: GoalSchema,
  conditions: z.array(ConditionSchema).max(10),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

/** Derived health numbers (BMI, estimated body fat, BMR, TDEE). */
export const HealthMetricsSchema = z.object({
  bmi: z.number(),
  bmiCategory: z.string(),
  bodyFatPct: z.number(),
  bmr: z.number(),
  tdee: z.number(),
});
export type HealthMetrics = z.infer<typeof HealthMetricsSchema>;

export const ProfileResponseSchema = z.object({
  name: z.string(),
  onboarded: z.boolean(),
  profile: ProfileInputSchema.nullable(),
  metrics: HealthMetricsSchema.nullable(),
  goals: NutritionGoalsSchema,
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

/** WHO BMI categories. */
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/**
 * BMI, estimated body fat (Deurenberg 1991: 1.20*BMI + 0.23*age - 10.8*sex - 5.4),
 * BMR (Mifflin-St Jeor 1990) and TDEE (standard activity multipliers).
 */
export function computeMetrics(p: ProfileInput): HealthMetrics {
  const heightM = p.heightCm / 100;
  const bmi = p.weightKg / (heightM * heightM);
  const male = p.sex === 'male' ? 1 : 0;
  const bodyFatPct = Math.max(3, 1.2 * bmi + 0.23 * p.age - 10.8 * male - 5.4);
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (male ? 5 : -161);
  const activityFactor = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  }[p.activityLevel];
  const tdee = bmr * activityFactor;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    bmi: round1(bmi),
    bmiCategory: bmiCategory(bmi),
    bodyFatPct: round1(bodyFatPct),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  };
}

/**
 * Daily calorie/macro goals from TDEE and the user's goal, adjusted for
 * medical conditions. Deficit/surplus and macro ratios follow mainstream
 * guidance: ~500 kcal deficit to lose, ~400 surplus to gain, protein
 * 1.6-2 g/kg, fat ~30% of calories, carbs the remainder (capped at 40%
 * of calories for diabetes, per lower-carb ADA-style guidance).
 */
export function computeGoals(p: ProfileInput): NutritionGoals {
  const { tdee } = computeMetrics(p);
  return goalsForCalories(p, tdee + GOAL_CALORIE_DELTA[p.goal]);
}

/** Daily calorie offset from maintenance for each goal. */
export const GOAL_CALORIE_DELTA: Record<Goal, number> = {
  lose_weight: -500,
  maintain: 0,
  gain_weight: 400,
  build_muscle: 300,
};

/**
 * Split a calorie target into macros for this profile. Shared by the formula
 * goals and the adaptive (measured-TDEE) goals so both obey the same safety
 * floor, protein-per-kg and diabetes carb cap.
 */
export function goalsForCalories(p: ProfileInput, target: number): NutritionGoals {
  const floor = p.sex === 'male' ? 1500 : 1200; // safe minimum intake
  const calories = Math.round(Math.max(floor, target));

  const proteinPerKg = p.goal === 'build_muscle' ? 2.0 : 1.6;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.3) / 9);
  let carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  if (p.conditions.includes('diabetes')) {
    carbs = Math.min(carbs, Math.round((calories * 0.4) / 4));
  }
  carbs = Math.max(carbs, 0);
  return { calories, protein, fat, carbs };
}

export const GroceryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  checked: z.boolean(),
  recipeId: z.string().nullable(),
  recipeName: z.string().nullable(),
});
export type GroceryItem = z.infer<typeof GroceryItemSchema>;

export const GroceryFromRecipeResponseSchema = z.object({
  added: z.array(GroceryItemSchema),
  skipped: z.number().int(),
});
export type GroceryFromRecipeResponse = z.infer<typeof GroceryFromRecipeResponseSchema>;

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------

export const MealPlanSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealPlanSlot = z.infer<typeof MealPlanSlotSchema>;

/** Compact recipe card embedded in a meal-plan entry. */
export const MealPlanRecipeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  calories: z.number().int().nullable(),
  protein: z.number().int().nullable(),
  carbs: z.number().int().nullable(),
  fat: z.number().int().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
});
export type MealPlanRecipeSummary = z.infer<typeof MealPlanRecipeSummarySchema>;

export const MealPlanEntrySchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  slot: MealPlanSlotSchema,
  recipeId: z.string().nullable(),
  customName: z.string().nullable(),
  servings: z.number().int(),
  recipe: MealPlanRecipeSummarySchema.nullable(),
});
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>;

/** Per-day macro totals: recipe nutrition × servings; custom entries count 0. */
export const MealPlanDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
});
export type MealPlanDay = z.infer<typeof MealPlanDaySchema>;

export const MealPlanWeekResponseSchema = z.object({
  weekStart: z.string(), // YYYY-MM-DD (Monday)
  weekEnd: z.string(), // YYYY-MM-DD (Sunday)
  days: z.array(MealPlanDaySchema), // all 7 days, Monday..Sunday
  entries: z.array(MealPlanEntrySchema),
});
export type MealPlanWeekResponse = z.infer<typeof MealPlanWeekResponseSchema>;

/** Create a meal-plan entry: exactly one of recipeId / customName required. */
export const CreateMealPlanEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: MealPlanSlotSchema,
    recipeId: z.string().min(1).max(64).optional(),
    customName: z.string().min(1).max(200).optional(),
    servings: z.number().int().min(1).max(20).optional(),
  })
  .refine((v) => (v.recipeId == null) !== (v.customName == null), {
    message: 'exactly one of recipeId or customName is required',
  });
export type CreateMealPlanEntry = z.infer<typeof CreateMealPlanEntrySchema>;

export const AutoFillResponseSchema = z.object({
  created: z.array(MealPlanEntrySchema),
});
export type AutoFillResponse = z.infer<typeof AutoFillResponseSchema>;

export const MealPlanToGroceryResponseSchema = z.object({
  added: z.array(GroceryItemSchema),
  skipped: z.number().int(),
});
export type MealPlanToGroceryResponse = z.infer<typeof MealPlanToGroceryResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  aiProviders: z.array(z.string()),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// Tracking (water + weight + progress)
// ---------------------------------------------------------------------------

const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WaterLogSchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  ml: z.number().int(),
  createdAt: z.string(), // ISO datetime
});
export type WaterLog = z.infer<typeof WaterLogSchema>;

/** Add a water entry; date defaults to today (UTC) server-side. */
export const AddWaterSchema = z.object({
  date: DayKeySchema.optional(),
  ml: z.number().int().min(1).max(5000),
});
export type AddWater = z.infer<typeof AddWaterSchema>;

export const WaterTodayResponseSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  totalMl: z.number().int(),
  entries: z.array(WaterLogSchema),
});
export type WaterTodayResponse = z.infer<typeof WaterTodayResponseSchema>;

export const WeightEntrySchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  kg: z.number(),
  note: z.string().nullable(),
  createdAt: z.string(), // ISO datetime
});
export type WeightEntry = z.infer<typeof WeightEntrySchema>;

/** Upsert a weigh-in for a day; date defaults to today (UTC) server-side. */
export const UpsertWeightSchema = z.object({
  date: DayKeySchema.optional(),
  kg: z.number().min(20).max(400),
  note: z.string().max(200).optional(),
});
export type UpsertWeight = z.infer<typeof UpsertWeightSchema>;

/** Per-day macro totals from actual MealLogs, for the weekly progress chart. */
export const ProgressDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
});
export type ProgressDay = z.infer<typeof ProgressDaySchema>;

export const ProgressSummaryResponseSchema = z.object({
  days: z.array(ProgressDaySchema),
});
export type ProgressSummaryResponse = z.infer<typeof ProgressSummaryResponseSchema>;

// ---------------------------------------------------------------------------
// Meal photo scanner (vision)
// ---------------------------------------------------------------------------

export const MealPhotoItemSchema = z.object({
  name: z.string().min(1).max(200),
  grams: z.number().nonnegative(),
});
export type MealPhotoItem = z.infer<typeof MealPhotoItemSchema>;

/**
 * What the vision model returns for one meal photo. `confidence` is the
 * model's own 0-1 self-report — the UI shows it so a shaky guess reads as a
 * guess, and every number stays editable before it is logged.
 */
export const MealPhotoAnalysisSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // Same cap as a custom log, which is where these items end up.
  items: z.array(MealPhotoItemSchema).max(30),
  calories: z.number().int().nonnegative(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
  note: z.string().optional(),
});
export type MealPhotoAnalysis = z.infer<typeof MealPhotoAnalysisSchema>;

/** JPEG/PNG data URL, ≤ ~1.5 MB encoded (the API body limit is 1 MB × slack). */
export const AnalyzeMealPhotoSchema = z.object({
  image: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/),
});
export type AnalyzeMealPhoto = z.infer<typeof AnalyzeMealPhotoSchema>;

// ---------------------------------------------------------------------------
// Nutrition label scanner — packaged food, read the Nutrition Facts panel
// ---------------------------------------------------------------------------

/**
 * Read straight off the printed panel, per serving as labeled — this is ground
 * truth from the package, not a model guess, so there is no confidence score.
 * servingsPerContainer lets the UI offer "log N servings" instead of just one.
 */
export const NutritionLabelAnalysisSchema = z.object({
  productName: z.string().min(1),
  servingSize: z.string().min(1),
  servingsPerContainer: z.number().positive().optional(),
  calories: z.number().int().nonnegative(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
  note: z.string().optional(),
});
export type NutritionLabelAnalysis = z.infer<typeof NutritionLabelAnalysisSchema>;

/** Same envelope as the meal photo scanner: one data URL, size-capped by the route. */
export const AnalyzeNutritionLabelSchema = z.object({
  image: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/),
});
export type AnalyzeNutritionLabel = z.infer<typeof AnalyzeNutritionLabelSchema>;

// ---------------------------------------------------------------------------
// Pantry — "what can I cook with what I have?"
// ---------------------------------------------------------------------------

/**
 * Models hand back a list-shaped field as prose about a third of the time
 * ("Heat oil. Add onion. Simmer."). Splitting it here beats failing the whole
 * response, and beats re-prompting for something already answered correctly.
 */
function coerceList(splitOn: RegExp) {
  return (v: unknown) =>
    typeof v === 'string'
      ? v
          .split(splitOn)
          .map((s) => s.trim())
          .filter(Boolean)
      : v;
}

const StepListSchema = z.preprocess(
  // Sentence-final punctuation, not every period — "1.5 tsp" must survive.
  coerceList(/(?<=[.!?])\s+(?=[A-Z])/),
  z.array(z.string().min(1)).min(1),
);

const NameListSchema = z.preprocess(coerceList(/\s*,\s*/), z.array(z.string()));

export const PantryIdeaSchema = z.object({
  name: z.string().min(1),
  cuisine: z.string(),
  minutes: z.number().int().nonnegative(),
  /** Pantry items the dish actually uses, echoed back so the match is visible. */
  uses: NameListSchema,
  /** Anything still needed — empty means it is cookable right now. */
  missing: NameListSchema,
  steps: StepListSchema,
  calories: z.number().int().nonnegative(),
});
export type PantryIdea = z.infer<typeof PantryIdeaSchema>;

export const PantryResponseSchema = z.object({
  ideas: z.array(PantryIdeaSchema),
  provider: z.string(),
});
export type PantryResponse = z.infer<typeof PantryResponseSchema>;

export const PantryRequestSchema = z.object({
  ingredients: z.array(z.string().min(1).max(100)).min(1).max(40),
  mealType: MealTypeSchema.optional(),
});
export type PantryRequest = z.infer<typeof PantryRequestSchema>;

// ---------------------------------------------------------------------------
// Weekly AI coach
// ---------------------------------------------------------------------------

export const CoachTipSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});
export type CoachTip = z.infer<typeof CoachTipSchema>;

export const CoachInsightSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  /** 0-100 adherence to the user's own targets, computed server-side. */
  score: z.number().int().min(0).max(100),
  wins: z.array(z.string()),
  tips: z.array(CoachTipSchema),
  provider: z.string(),
});
export type CoachInsight = z.infer<typeof CoachInsightSchema>;

/**
 * Shape an AI provider must return for recipe generation. Validated after
 * defensive JSON extraction; failure => provider is treated as failed.
 */
export const AIRecipeSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  cuisine: z.string().min(1),
  ingredients: z
    .array(z.object({ name: z.string().min(1), measure: z.string() }))
    .min(1),
  instructions: z.string().min(1),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
});
export type AIRecipe = z.infer<typeof AIRecipeSchema>;

// ---------------------------------------------------------------------------
// Quick-add — "2 eggs, toast, 200g rice" typed as one line
// ---------------------------------------------------------------------------

// Units the API's measureToGrams understands, so a parsed measure round-trips.
const TEXT_UNITS =
  'kg|g|grams?|mg|oz|ounces?|lbs?|pounds?|ml|l|litres?|liters?|tsp|teaspoons?|tbsp|tbs|tablespoons?|cups?|pints?|cans?|tins?|slices?|handfuls?|bowls?|glass(?:es)?|scoops?|pinch(?:es)?|bunch(?:es)?|knobs?|rashers?|cloves?|sticks?|packets?|packs?|bags?|sheets?|cubes?';
const WORD_QTY: Record<string, string> = {
  a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', half: '1/2',
};
// Digits may be glued to a unit ("200g"); a word quantity needs a space, so
// "a" never eats the first letter of "apple".
const LEADING = new RegExp(
  String.raw`^(?:(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾])\s*|(a|an|one|two|three|four|five|six|half)\s+)` +
    String.raw`(?:(${TEXT_UNITS})\b\.?\s*)?(?:pieces?\s+)?(?:of\s+)?(.+)$`,
  'i',
);
// "handful of almonds", "bowl of rice" — a unit with no number means one.
const UNIT_ONLY = new RegExp(String.raw`^(${TEXT_UNITS})\b\.?\s+(?:of\s+)?(.+)$`, 'i');
const TRAILING = new RegExp(String.raw`^(.+?)\s+(\d+(?:\.\d+)?)\s*(${TEXT_UNITS})$`, 'i');

/**
 * Split a typed meal into name/measure items. Pure and synchronous, so the
 * client can show the rows instantly and the API's measure maths does the rest.
 * No quantity means one piece ("toast" → "1").
 *
 * ponytail: splits on "and", so "mac and cheese" becomes two rows; the
 * user sees the rows before logging and can merge them. A real food NER is the
 * upgrade if that proves common.
 */
export function parseMealText(text: string): CustomLogItem[] {
  return text
    .split(/[,;\n+&]|\band\b/i)
    .map((chunk) => chunk.trim().replace(/\s+/g, ' '))
    .filter((chunk) => /[a-z]/i.test(chunk))
    .map((chunk) => {
      const trail = chunk.match(TRAILING);
      if (trail) return { name: trail[1], measure: `${trail[2]} ${trail[3].toLowerCase()}` };
      const unitOnly = chunk.match(UNIT_ONLY);
      if (unitOnly) return { name: unitOnly[2].trim(), measure: `1 ${unitOnly[1].toLowerCase()}` };
      const lead = chunk.match(LEADING);
      if (lead) {
        const qty = lead[1] ?? WORD_QTY[lead[2].toLowerCase()];
        const measure = lead[3] ? `${qty} ${lead[3].toLowerCase()}` : qty;
        return { name: lead[4].trim(), measure };
      }
      return { name: chunk, measure: '1' };
    });
}

export const LogPreviewRequestSchema = z.object({
  items: z.array(CustomLogItemSchema).min(1).max(30),
});
export type LogPreviewRequest = z.infer<typeof LogPreviewRequestSchema>;

/** One typed item with the grams it was read as and whether any food matched. */
export const LogPreviewItemSchema = z.object({
  name: z.string(),
  measure: z.string(),
  grams: z.number().int(),
  resolved: z.boolean(),
  calories: z.number().int(),
  protein: z.number().int(),
  carbs: z.number().int(),
  fat: z.number().int(),
});
export type LogPreviewItem = z.infer<typeof LogPreviewItemSchema>;

export const LogPreviewResponseSchema = z.object({
  items: z.array(LogPreviewItemSchema),
  totals: MacrosSchema,
});
export type LogPreviewResponse = z.infer<typeof LogPreviewResponseSchema>;

// ---------------------------------------------------------------------------
// Barcode — packaged food via Open Food Facts (free, no key)
// ---------------------------------------------------------------------------

/** EAN-8, UPC-A/E, EAN-13, GTIN-14. */
export const BarcodeSchema = z.string().regex(/^\d{8,14}$/);

export const FoodProductSchema = z.object({
  barcode: BarcodeSchema,
  name: z.string(),
  brand: z.string().nullable(),
  // Grams in the manufacturer's serving, when the product declares one.
  servingGrams: z.number().nullable(),
  per100g: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
});
export type FoodProduct = z.infer<typeof FoodProductSchema>;

/** The client picks the product and how much; the API computes the macros. */
export const LogBarcodeSchema = z.object({
  barcode: BarcodeSchema,
  grams: z.number().positive().max(3000),
  mealType: MealTypeSchema,
});
export type LogBarcode = z.infer<typeof LogBarcodeSchema>;

// ---------------------------------------------------------------------------
// Adaptive goals — targets recalibrated from measured intake vs weight trend
// ---------------------------------------------------------------------------

export const AdaptiveGoalsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('collecting'),
    windowDays: z.number().int(),
    loggedDays: z.number().int(),
    requiredLoggedDays: z.number().int(),
    weighIns: z.number().int(),
    requiredWeighIns: z.number().int(),
    weighInSpanDays: z.number().int(),
    requiredSpanDays: z.number().int(),
  }),
  z.object({
    status: z.literal('ready'),
    windowDays: z.number().int(),
    loggedDays: z.number().int(),
    weighIns: z.number().int(),
    avgIntake: z.number().int(),
    weeklyChangeKg: z.number(),
    formulaTdee: z.number().int(),
    estimatedTdee: z.number().int(),
    current: NutritionGoalsSchema,
    suggested: NutritionGoalsSchema,
    // False when the suggestion is within noise of the current target.
    changed: z.boolean(),
  }),
]);
export type AdaptiveGoalsResponse = z.infer<typeof AdaptiveGoalsResponseSchema>;
