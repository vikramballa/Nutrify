import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Recipe } from '@nutrichef/shared';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  RecipeDetail: { recipe: Recipe };
  /** "What do you have?" — mark a recipe's ingredients, shop for the rest. */
  ShopRecipe: { recipe: Recipe };
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
