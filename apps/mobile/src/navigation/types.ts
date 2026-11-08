import type { NavigatorScreenParams } from '@react-navigation/native';
import type { MealType, Recipe } from '@nutrichef/shared';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  RecipeDetail: { recipe: Recipe };
  /** "What do you have?" — mark a recipe's ingredients, shop for the rest. */
  ShopRecipe: { recipe: Recipe };
  MealPlan: undefined;
  Progress: undefined;
  /** `mealType` pre-selects the slot — Beverages opens straight on the drink picker. */
  LogMeal: { mealType?: MealType } | undefined;
  /** One day's meals to review, edit or delete. `date` is a UTC day key; default today. */
  Meals: { date?: string } | undefined;
  Onboarding: undefined;
  Settings: undefined;
  Saved: undefined;
  Pantry: undefined;
  Barcode: undefined;
};

export type TabParamList = {
  Home: undefined;
  Recipes: undefined;
  /**
   * Centre tab — the raised camera button. `labelFor`: open in label mode to
   * scan the label of a barcode Open Food Facts doesn't know.
   */
  Scan: { labelFor?: string } | undefined;
  Grocery: undefined;
  Ask: undefined;
};
