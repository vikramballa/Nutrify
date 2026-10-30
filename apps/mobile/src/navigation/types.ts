import type { Recipe } from '@nutrichef/shared';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Tabs: undefined;
  RecipeDetail: { recipe: Recipe };
  MealPlan: undefined;
  Progress: undefined;
  LogMeal: undefined;
  Onboarding: undefined;
  Settings: undefined;
  Saved: undefined;
  Pantry: undefined;
  Barcode: undefined;
};

export type TabParamList = {
  Home: undefined;
  Recipes: undefined;
  /** Centre tab — the raised camera button. */
  Scan: undefined;
  Grocery: undefined;
  Ask: undefined;
};
