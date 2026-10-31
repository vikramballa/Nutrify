import { describe, it, expect } from 'vitest';
import {
  estimateServings,
  forState,
  measureToGrams,
  pickUsdaFood,
  recipeNutrition,
  resolveMeasure,
  staticLookup,
  usdaMacros,
} from '../src/services/nutritionData.js';

describe('measureToGrams', () => {
  it('parses explicit weights', () => {
    expect(measureToGrams('200g', 'Chicken')).toBe(200);
    expect(measureToGrams('1kg', 'Potatoes')).toBe(1000);
    expect(measureToGrams('4 oz', 'Cheddar Cheese')).toBe(112);
  });

  it('weighs volumes by the density of the food', () => {
    expect(measureToGrams('2 tbsp', 'Olive Oil')).toBeCloseTo(27.6);
    expect(measureToGrams('1/2 cup', 'Milk')).toBeCloseTo(123.6);
    expect(measureToGrams('1 1/2 cups', 'Flour')).toBeCloseTo(190.8); // not 360
    expect(measureToGrams('1 cup', 'Mint')).toBeCloseTo(24); // not 240
    expect(measureToGrams('1 cup', 'Cashews')).toBeCloseTo(139.2);
    expect(measureToGrams('2 cups', 'Basmati rice')).toBeCloseTo(374.4);
    expect(measureToGrams('600ml', 'Chicken stock')).toBe(600); // stock, not chicken
    expect(measureToGrams('1 cup', 'Mystery liquid')).toBe(240);
  });

  it('parses counts by ingredient piece weight', () => {
    expect(measureToGrams('3', 'Eggs')).toBe(150);
    expect(measureToGrams('2', 'Onions')).toBe(220);
    expect(measureToGrams('2 cloves', 'Garlic')).toBe(10);
    expect(measureToGrams('4', 'Bacon')).toBe(100);
    expect(measureToGrams('1', 'Pineapple')).toBe(60); // not a 180 g apple
    expect(measureToGrams('3', 'Egg Plants')).toBe(900); // not eggs
    expect(measureToGrams('1', 'Rapeseed Oil')).toBe(15);
    expect(measureToGrams('1 can', 'Coconut Milk')).toBe(400);
    expect(measureToGrams('pinch', 'Saffron')).toBe(1);
  });

  it('weighs small items and specific cuts by their own piece weight', () => {
    expect(measureToGrams('15', 'Almonds')).toBeCloseTo(18);
    expect(measureToGrams('5', 'Cardamom')).toBeCloseTo(1);
    expect(measureToGrams('4', 'Chicken Breasts')).toBe(680);
    expect(measureToGrams('6', 'Black Peppercorns')).toBeCloseTo(0.6);
  });

  it('uses the unit written first and knows odd spoon spellings', () => {
    expect(measureToGrams('50ml/2fl oz', 'Double Cream')).toBe(50);
    expect(measureToGrams('2fl oz', 'Double Cream')).toBe(60);
    expect(measureToGrams('5 tblsp', 'Peanut Butter')).toBeCloseTo(80.25);
    expect(measureToGrams('1 tbls', 'Spring Onions')).toBeCloseTo(9.9);
  });

  it('weighs food-dependent units by the food', () => {
    expect(measureToGrams('1 stick', 'Butter')).toBe(113);
    expect(measureToGrams('1 small stick', 'Cinnamon')).toBe(3); // not 113
    expect(measureToGrams('1 head', 'Garlic')).toBe(50);
    expect(measureToGrams('knob', 'Butter')).toBe(10);
    expect(measureToGrams('5 cm piece', 'Ginger')).toBe(25);
    expect(measureToGrams('12 florets', 'Broccoli')).toBe(120);
    expect(measureToGrams('3 rashers', 'Bacon')).toBe(75);
    expect(measureToGrams('2 slices', 'Pizza')).toBe(214);
    expect(measureToGrams('2 slices', 'Bread')).toBe(60);
  });

  it('reads unmeasured countable items as one piece, and packs by the food', () => {
    expect(resolveMeasure('Peeled and Sliced', 'Avocado')).toEqual({ grams: 150, basis: 'piece' });
    expect(measureToGrams('Beaten', 'Egg Yolks')).toBe(17);
    expect(measureToGrams('20', 'Brussels Sprouts')).toBe(200); // not 1.2 kg
    expect(measureToGrams('1 Packet', 'Noodles')).toBe(85);
    expect(measureToGrams('1/2 bag', 'Rice Stick Noodles')).toBe(200);
    expect(measureToGrams('1 sheet, shredded', 'Nori')).toBe(3);
    expect(measureToGrams('8', 'Curry leaves')).toBeCloseTo(0.8); // not 480 g
    expect(measureToGrams('2', 'Beef Stock Cubes')).toBe(20);
    expect(measureToGrams('Chopped', 'Freshly Chopped Parsley')).toBe(5);
  });

  it('reads garnishes and frying oil as small amounts, not 50 g', () => {
    expect(measureToGrams('To Glaze', 'Eggs')).toBe(5);
    expect(measureToGrams('Sprinking', 'Canola Oil')).toBe(5);
    expect(resolveMeasure('to taste', 'Pepper')).toEqual({ grams: 5, basis: 'trace' });
    expect(measureToGrams('Dusting', 'Icing Sugar')).toBe(5);
    expect(measureToGrams('for frying', 'Vegetable oil')).toBe(10);
    expect(measureToGrams('', 'Olive Oil')).toBe(15);
    expect(measureToGrams('2 tbsp grated', 'Parmesan')).toBeCloseTo(12.6); // numbered: full amount
  });

  it('defaults unparseable measures to 50g', () => {
    expect(resolveMeasure('', 'Mystery')).toEqual({ grams: 50, basis: 'default' });
  });
});

describe('estimateServings', () => {
  it('divides total weight by a category portion', () => {
    expect(estimateServings(2000, 'Chicken')).toBe(6); // 350 g plates
    expect(estimateServings(960, 'Dessert')).toBe(8); // 120 g slices
    expect(estimateServings(600, 'Side')).toBe(3);
  });

  it('portions breads by the piece, whatever their category', () => {
    expect(estimateServings(400, 'Side', 'Tandoori Roti')).toBe(4); // 90 g, not 200 g
  });

  it('clamps to 1..16', () => {
    expect(estimateServings(90, 'Beef')).toBe(1);
    expect(estimateServings(10_000, 'Dessert')).toBe(16);
  });
});

describe('staticLookup', () => {
  it('matches the head noun, not the longest word', () => {
    expect(staticLookup('Butter Beans')?.calories).toBe(127);
    expect(staticLookup('Chicken Stock')?.calories).toBe(5);
    expect(staticLookup('Peanut Butter')?.calories).toBe(588);
    expect(staticLookup('Breadcrumbs')?.calories).toBe(395);
    expect(staticLookup('Coconut Milk')?.calories).toBe(230);
    expect(staticLookup('Rice vinegar')?.calories).toBe(18);
  });

  it('matches whole words only, plurals included', () => {
    expect(staticLookup('Eggplant')?.calories).toBe(25); // not egg
    expect(staticLookup('Goat meat')).toBeNull(); // not oat
    expect(staticLookup('Sirloin steak')?.calories).toBe(200); // steak, not black tea
    expect(staticLookup('Lemongrass')?.calories).toBe(99); // not lemon (29)
    expect(staticLookup('Chillies')?.calories).toBe(40);
    expect(staticLookup('Tomatoes')?.calories).toBe(18);
    expect(staticLookup('Chickpeas')?.calories).toBe(164); // not pea
    expect(staticLookup('Courgettes')?.calories).toBe(17);
    expect(staticLookup('Gruyère or Emmental')?.calories).toBe(380);
  });
});

describe('dish names people log', () => {
  it('reads the dish, not a spice or garnish inside its name', () => {
    expect(staticLookup('chicken curry')?.calories).toBe(130); // was the 0-kcal spice
    expect(staticLookup('Curry powder')?.calories).toBe(0);
    expect(staticLookup('Green curry paste')?.calories).toBe(100);
    expect(staticLookup('Garam masala')?.calories).toBe(0);
    expect(staticLookup('chana masala')?.calories).toBe(130);
    expect(staticLookup('mint chutney')?.calories).toBe(60); // not mint leaves
    expect(staticLookup('tomato soup')?.calories).toBe(45);
  });

  it('weighs a cup of cooked pasta heavier than dry shapes', () => {
    expect(measureToGrams('1 cup', 'pasta', 'cooked')).toBeCloseTo(139.2);
    expect(measureToGrams('1 cup', 'macaroni')).toBeCloseTo(105.6); // dry, in a recipe
  });
});

describe('forState', () => {
  const rice = staticLookup('rice')!;

  it('keeps recipe grains dry and typed logs cooked', () => {
    expect(forState('Basmati rice', '2 cups', rice, 'dry').calories).toBe(365);
    expect(forState('rice', '200g', rice, 'cooked').calories).toBeCloseTo(130.36, 1);
  });

  it('lets the text override the default', () => {
    expect(forState('Rice', '3 cups cooked', rice, 'dry').calories).toBeCloseTo(130.36, 1);
    expect(forState('Cooked jasmine rice', '450 g', rice, 'dry').calories).toBeCloseTo(130.36, 1);
    expect(forState('rice', '50g uncooked', rice, 'cooked').calories).toBe(365);
  });

  it('leaves foods without a cooked yield alone', () => {
    const flour = staticLookup('flour')!;
    expect(forState('Rice flour', '1 cup', flour, 'cooked')).toBe(flour);
  });
});

describe('pickUsdaFood', () => {
  const d = (...names: string[]) => names.map((description) => ({ description }));

  it('skips candy, restaurant and brand results', () => {
    expect(pickUsdaFood('mint', d('Candies, NESTLE, AFTER EIGHT Mints', 'Spearmint, fresh'))).toBe(1);
    expect(pickUsdaFood('mozzarella', d("APPLEBEE'S, mozzarella sticks", 'Cheese, mozzarella, whole milk'))).toBe(1);
  });

  it('requires the main word, preferring it where USDA names the food', () => {
    expect(pickUsdaFood('olives', d('Olive loaf, pork', 'Olives, ripe, canned'))).toBe(1);
    expect(pickUsdaFood('mature cheddar', d('Spinach, mature'))).toBe(-1);
    expect(pickUsdaFood('candied peel', d('Cucumber, peeled, raw'))).toBe(-1);
  });

  it('rejects a result missing every describing word', () => {
    expect(pickUsdaFood('caesar dressing', d('Dressing, Ranch'))).toBe(-1);
    expect(pickUsdaFood('miso paste', d('Tomato, paste, canned', 'Miso'))).toBe(-1);
    expect(pickUsdaFood('poppy seeds', d('Seeds, lotus seeds, raw', 'Spices, poppy seed'))).toBe(1);
  });

  it('prefers the plain food over a product made from it', () => {
    expect(
      pickUsdaFood('sesame seeds', d('Seeds, sesame butter, tahini, from raw kernels', 'Seeds, sesame seeds, whole, dried')),
    ).toBe(1);
    expect(pickUsdaFood('queso fresco or feta', d('Cheese, feta'))).toBe(0);
  });

  it('ignores qualifiers and bracketed notes', () => {
    expect(pickUsdaFood('fresh chopped leeks (washed)', d('Leeks, (bulb and lower leaf-portion), raw'))).toBe(0);
  });
});

describe('usdaMacros', () => {
  const n = (num: string, value: number) => ({ nutrientNumber: num, value });

  it('reads energy from the Atwater fields when 208 is missing', () => {
    expect(usdaMacros({ foodNutrients: [n('957', 53), n('203', 1), n('205', 12), n('204', 0.2)] })?.calories).toBe(53);
  });

  it('computes energy from macros when none is reported', () => {
    expect(usdaMacros({ foodNutrients: [n('203', 22.6), n('205', 1.9), n('204', 32.6)] })?.calories).toBe(391);
  });
});

describe('recipeNutrition', () => {
  // Per-100g straight from the static table, as ingredientsPer100g would give.
  const lookupFor = (names: string[]) =>
    new Map(names.map((n) => [n.trim().toLowerCase(), staticLookup(n)]));
  const run = (r: Parameters<typeof recipeNutrition>[0]) =>
    recipeNutrition(r, lookupFor(r.ingredients.map((i) => i.name)))!;

  it('keeps the water a pinch of dal could not absorb', () => {
    const upma = run({
      name: 'Rava Upma',
      category: 'Breakfast',
      ingredients: [
        { name: 'Semolina (rava)', measure: '1 cup' },
        { name: 'Urad dal', measure: '1 tsp' },
        { name: 'Water', measure: '2.5 cups' },
        { name: 'Ghee', measure: '2 tbsp' },
      ],
    });
    // Was 1 serving of 917 kcal: the teaspoon of dal cancelled all the water.
    expect(upma.servings).toBeGreaterThanOrEqual(2);
    expect(upma.calories).toBeLessThan(450);
  });

  it('counts 15% of a frying pot, desserts that fry included', () => {
    const jalebi = run({
      name: 'Jalebi',
      category: 'Dessert',
      instructions: 'Pipe spiral coils into hot oil. Fry for 2 minutes until crisp.',
      declaredServings: 8,
      ingredients: [
        { name: 'Flour', measure: '1 cup' },
        { name: 'Sugar', measure: '1.5 cups' },
        { name: 'Water', measure: '3/4 cup' },
        { name: 'Oil', measure: '500 ml' },
      ],
    });
    // 500 ml oil → 69 g eaten, syrup half eaten: ~1300 kcal over 8.
    expect(jalebi.calories).toBeGreaterThan(130);
    expect(jalebi.calories).toBeLessThan(220);
  });

  it('counts all the oil in a cake that is baked', () => {
    const lines = [
      { name: 'Vegetable Oil', measure: '450ml' },
      { name: 'Plain Flour', measure: '400g' },
    ];
    const baked = run({ name: 'Carrot Cake', category: 'Dessert', instructions: 'Bake for 40 minutes.', declaredServings: 16, ingredients: lines });
    // 414 g oil + 400 g flour ≈ 5100 kcal over 16.
    expect(baked.calories).toBeGreaterThan(300);
  });

  it('believes a declared serving count over the weight estimate', () => {
    const r = run({
      name: 'Idli',
      category: 'Breakfast',
      declaredServings: 7,
      ingredients: [
        { name: 'Idli rice', measure: '2 cups' },
        { name: 'Urad dal', measure: '1/2 cup' },
      ],
    });
    expect(r.servings).toBe(7);
    expect(r.servingGrams).toBeGreaterThan(100);
  });

  it('weighs meat raw in recipes and cooked in typed logs', () => {
    const chicken = staticLookup('chicken')!;
    expect(forState('Chicken thighs', '800 g', chicken, 'dry').calories).toBe(150);
    expect(forState('chicken', '200g', chicken, 'cooked').calories).toBe(200);
    const curry = run({
      name: 'Mutton Rogan Josh',
      category: 'Dinner',
      declaredServings: 4,
      ingredients: [
        { name: 'Mutton', measure: '750 g' },
        { name: 'Yogurt', measure: '1 cup' },
        { name: 'Oil', measure: '4 tbsp' },
      ],
    });
    // Cooked-meat values on the raw 750 g made it 62 g a serving.
    expect(curry.protein).toBeLessThan(45);
  });
});

describe('portions by dish name', () => {
  it('only treats a name ending in a bread word as bread', () => {
    expect(estimateServings(2700, 'Lunch', 'Pav Bhaji')).toBe(8); // 350 g, not 16 × 90 g
    expect(estimateServings(1100, 'Breakfast', 'Aloo Paratha')).toBe(12);
  });

  it('portions chutneys and raitas as sides on the plate', () => {
    expect(estimateServings(240, 'Side', 'Coconut Chutney')).toBe(6);
    expect(estimateServings(500, 'Side', 'Boondi Raita')).toBe(4);
  });
});
