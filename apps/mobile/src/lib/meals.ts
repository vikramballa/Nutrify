import type { Ionicons } from '@expo/vector-icons';
import type { MealType } from '@nutrichef/shared';

/** Every slot a log can be filed under, in the order of a day. */
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'beverage'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
  beverage: 'Beverages',
};

export const MEAL_ICONS: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'nutrition-outline',
  beverage: 'cafe-outline',
};

/** Label for a meal type from the wire, tolerant of a value this build doesn't know. */
export function mealLabel(type: string): string {
  return MEAL_LABELS[type as MealType] ?? type[0].toUpperCase() + type.slice(1);
}

export interface BeverageOption {
  key: string;
  label: string;
  /** The food name the API prices — each one is a DISHES entry. */
  food: string;
  /** The size it is usually served in, in ml. */
  ml: number;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * What "Beverages" asks for. The food names are DISHES keys in the API's
 * nutrition tables, so each is priced from a real per-100 ml value rather
 * than a model guess; "Something else" falls through to typing it.
 */
export const BEVERAGES: BeverageOption[] = [
  { key: 'tea', label: 'Tea (milk + sugar)', food: 'tea', ml: 150, icon: 'cafe-outline' },
  { key: 'tea-plain', label: 'Tea, no sugar', food: 'unsweetened tea', ml: 150, icon: 'cafe-outline' },
  { key: 'green-tea', label: 'Green / black tea', food: 'green tea', ml: 200, icon: 'leaf-outline' },
  { key: 'coffee', label: 'Coffee (milk + sugar)', food: 'coffee', ml: 150, icon: 'cafe-outline' },
  { key: 'coffee-plain', label: 'Coffee, no sugar', food: 'unsweetened coffee', ml: 150, icon: 'cafe-outline' },
  { key: 'black-coffee', label: 'Black coffee', food: 'black coffee', ml: 200, icon: 'cafe-outline' },
  { key: 'cold-coffee', label: 'Cold coffee', food: 'cold coffee', ml: 250, icon: 'snow-outline' },
  { key: 'soft-drink', label: 'Soft drink', food: 'soft drink', ml: 330, icon: 'beer-outline' },
  { key: 'diet-soda', label: 'Diet / zero soda', food: 'diet soda', ml: 330, icon: 'beer-outline' },
  { key: 'juice', label: 'Fruit juice', food: 'fruit juice', ml: 250, icon: 'water-outline' },
  { key: 'lassi', label: 'Sweet lassi', food: 'lassi', ml: 250, icon: 'water-outline' },
  { key: 'buttermilk', label: 'Buttermilk', food: 'buttermilk', ml: 200, icon: 'water-outline' },
  { key: 'milk', label: 'Milk', food: 'milk', ml: 200, icon: 'water-outline' },
  { key: 'milkshake', label: 'Milkshake', food: 'milkshake', ml: 300, icon: 'ice-cream-outline' },
  { key: 'coconut-water', label: 'Coconut water', food: 'coconut water', ml: 250, icon: 'water-outline' },
  { key: 'energy-drink', label: 'Energy drink', food: 'energy drink', ml: 250, icon: 'flash-outline' },
];

/** Sizes offered once a drink is picked; the drink's own size is pre-selected. */
export const BEVERAGE_SIZES: { label: string; ml: number }[] = [
  { label: 'Small cup', ml: 100 },
  { label: 'Cup', ml: 150 },
  { label: 'Mug', ml: 200 },
  { label: 'Glass', ml: 250 },
  { label: 'Can', ml: 330 },
  { label: 'Bottle', ml: 500 },
];
