/**
 * Reference data for the nutrition maths in nutritionData.ts. Every table is
 * keyed by a food word matched whole-word against ingredient names, rightmost
 * match wins ("butter beans" → bean, "chicken stock" → stock).
 *
 * After changing STATIC, clear IngredientNutrition rows with source STATIC or
 * NONE and rerun db:backfill-nutrition — the cache otherwise keeps old values.
 */

export interface Per100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const zero: Per100g = { calories: 0, protein: 0, carbs: 0, fat: 0 };
const m = (calories: number, protein: number, carbs: number, fat: number): Per100g => ({
  calories,
  protein,
  carbs,
  fat,
});

// Grains and pulses are stored DRY — how recipes list them. COOKED_YIELD
// below converts when the food is eaten cooked (a typed "200g rice" log, or a
// recipe line that says "cooked"). Storing cooked values undercounted every
// "2 cups basmati" by ~2.8x.
const DRY_PASTA = m(371, 13, 75, 2);

// Per-100g macros (USDA SR Legacy / Foundation, rounded).
export const STATIC: Record<string, Per100g> = {
  // meat & fish
  chicken: m(239, 27, 0, 14),
  beef: m(250, 26, 0, 15),
  sirloin: m(140, 21, 0, 6),
  ribeye: m(291, 19, 0, 23),
  steak: m(200, 26, 0, 10),
  'corned beef': m(250, 27, 0, 15),
  pork: m(242, 27, 0, 14),
  lamb: m(294, 25, 0, 21),
  mutton: m(234, 33, 0, 11),
  bacon: m(541, 37, 1, 42),
  sausage: m(301, 12, 3, 27),
  chorizo: m(455, 24, 2, 38),
  ham: m(145, 21, 1, 6),
  turkey: m(189, 29, 0, 7),
  duck: m(337, 19, 0, 28),
  'black pudding': m(297, 10, 15, 22),
  salmon: m(208, 20, 0, 13),
  tuna: m(132, 28, 0, 1),
  cod: m(82, 18, 0, 1),
  fish: m(110, 22, 0, 2),
  shrimp: m(99, 24, 0, 0),
  prawn: m(99, 24, 0, 0),
  oyster: m(81, 9, 5, 2),
  pilchard: m(208, 25, 0, 12),
  anchovy: m(131, 20, 0, 5),
  'anchovy fillet': m(131, 20, 0, 5),
  // dairy & eggs
  egg: m(143, 13, 1, 10),
  'egg white': m(52, 11, 1, 0),
  'egg yolk': m(322, 16, 4, 27),
  milk: m(61, 3, 5, 3),
  buttermilk: m(40, 3, 5, 1),
  butter: m(717, 1, 0, 81),
  ghee: m(900, 0, 0, 100),
  cream: m(340, 2, 3, 36),
  'creme fraiche': m(290, 2, 3, 30),
  'crème fraîche': m(290, 2, 3, 30),
  custard: m(122, 4, 17, 4),
  cheese: m(402, 25, 1, 33),
  cheddar: m(403, 25, 1, 33),
  'monterey jack': m(373, 24, 1, 30),
  mozzarella: m(280, 28, 3, 17),
  parmesan: m(431, 38, 4, 29),
  pecorino: m(387, 32, 4, 27),
  gruyere: m(413, 30, 0, 32),
  'gruyère': m(413, 30, 0, 32),
  emmental: m(380, 27, 2, 30),
  mascarpone: m(429, 5, 4, 44),
  'cream cheese': m(342, 6, 4, 34),
  paneer: m(296, 20, 4, 22),
  yogurt: m(61, 3, 5, 3),
  yoghurt: m(61, 3, 5, 3),
  tofu: m(76, 8, 2, 5),
  // fats
  oil: m(884, 0, 0, 100),
  shortening: m(884, 0, 0, 100),
  lard: m(902, 0, 0, 100),
  suet: m(854, 2, 0, 94),
  mayonnaise: m(680, 1, 1, 75),
  // flours, breads, bakes
  flour: m(364, 10, 76, 1),
  'rice flour': m(366, 6, 80, 1),
  cornflour: m(381, 0, 91, 0),
  cornstarch: m(381, 0, 91, 0),
  starch: m(381, 0, 91, 0),
  semolina: m(360, 13, 73, 1),
  rava: m(360, 13, 73, 1),
  bread: m(265, 9, 49, 3),
  baguette: m(274, 11, 52, 3),
  flatbread: m(297, 9, 52, 6),
  bun: m(280, 9, 50, 4),
  breadcrumb: m(395, 13, 72, 5),
  tortilla: m(218, 6, 45, 3),
  'taco shell': m(470, 7, 62, 22),
  wonton: m(291, 10, 58, 2),
  pastry: m(530, 7, 50, 33),
  dough: m(250, 8, 48, 3),
  'dosa batter': m(180, 5, 37, 1),
  'idli batter': m(180, 5, 37, 1),
  digestive: m(480, 7, 63, 21),
  meringue: m(390, 5, 94, 0),
  'christmas pudding': m(330, 3, 56, 10),
  yeast: m(325, 40, 41, 8),
  // grains & pulses — DRY (see COOKED_YIELD)
  rice: m(365, 7, 80, 1),
  'rice krispies': m(380, 6, 87, 1),
  poha: m(350, 7, 77, 1),
  pasta: DRY_PASTA,
  spaghetti: DRY_PASTA,
  macaroni: DRY_PASTA,
  penne: DRY_PASTA,
  rigatoni: DRY_PASTA,
  fusilli: DRY_PASTA,
  linguine: DRY_PASTA,
  tagliatelle: DRY_PASTA,
  lasagne: DRY_PASTA,
  lasagna: DRY_PASTA,
  vermicelli: DRY_PASTA,
  noodle: m(375, 11, 75, 2),
  couscous: m(376, 13, 77, 1),
  bulgur: m(342, 12, 76, 1),
  barley: m(352, 10, 78, 1),
  quinoa: m(368, 14, 64, 6),
  lentil: m(352, 25, 63, 1),
  'urad dal': m(341, 25, 59, 2),
  'chana dal': m(360, 22, 60, 5),
  'toor dal': m(343, 22, 63, 2),
  'moong dal': m(347, 24, 63, 1),
  'mixed grain': m(350, 11, 72, 3),
  sago: m(355, 0, 88, 0),
  oat: m(389, 17, 66, 7),
  oatmeal: m(389, 17, 66, 7),
  granola: m(489, 14, 54, 24),
  // Chickpeas and beans stay cooked: recipes mostly use them canned.
  chickpea: m(164, 9, 27, 3),
  bean: m(127, 9, 23, 1),
  // sugars & sweets
  sugar: m(387, 0, 100, 0),
  honey: m(304, 0, 82, 0),
  syrup: m(260, 0, 67, 0),
  treacle: m(290, 1, 75, 0),
  molasses: m(290, 0, 75, 0),
  jam: m(250, 0, 65, 0),
  chocolate: m(546, 5, 61, 31),
  cocoa: m(228, 20, 58, 14),
  cacao: m(228, 20, 58, 14),
  marzipan: m(444, 9, 57, 21),
  mincemeat: m(280, 1, 60, 4),
  'candied peel': m(320, 0, 80, 0),
  'mixed peel': m(320, 0, 80, 0),
  'glace cherry': m(320, 0, 80, 0),
  'mars bar': m(450, 4, 70, 17),
  boondi: m(520, 12, 48, 31),
  // vegetables
  potato: m(77, 2, 17, 0),
  tomato: m(18, 1, 4, 0),
  onion: m(40, 1, 9, 0),
  'spring onion': m(32, 2, 7, 0),
  'green onion': m(32, 2, 7, 0),
  scallion: m(32, 2, 7, 0),
  radish: m(16, 1, 3, 0),
  daikon: m(18, 1, 4, 0),
  shallot: m(72, 3, 17, 0),
  challot: m(72, 3, 17, 0), // corpus misspelling
  garlic: m(149, 6, 33, 1),
  ginger: m(80, 2, 18, 1),
  galangal: m(71, 1, 15, 1),
  lemongrass: m(99, 2, 25, 1),
  carrot: m(41, 1, 10, 0),
  pea: m(81, 5, 14, 0),
  'petit pois': m(81, 5, 14, 0),
  spinach: m(23, 3, 4, 0),
  mushroom: m(22, 3, 3, 0),
  pepper: m(31, 1, 6, 0),
  capsicum: m(31, 1, 6, 0),
  chilli: m(40, 2, 9, 0),
  chili: m(40, 2, 9, 0),
  jalapeno: m(29, 1, 7, 0),
  'jalapeño': m(29, 1, 7, 0),
  chipotle: m(90, 3, 12, 3),
  broccoli: m(34, 3, 7, 0),
  cabbage: m(25, 1, 6, 0),
  cauliflower: m(25, 2, 5, 0),
  celery: m(16, 1, 3, 0),
  cucumber: m(15, 1, 4, 0),
  lettuce: m(15, 1, 3, 0),
  corn: m(86, 3, 19, 1),
  sweetcorn: m(86, 3, 19, 1),
  courgette: m(17, 1, 3, 0),
  zucchini: m(17, 1, 3, 0),
  aubergine: m(25, 1, 6, 0),
  eggplant: m(25, 1, 6, 0),
  'egg plant': m(25, 1, 6, 0),
  baingan: m(25, 1, 6, 0),
  swede: m(38, 1, 9, 0),
  squash: m(45, 1, 12, 0),
  fennel: m(31, 1, 7, 0),
  vegetable: m(65, 3, 12, 1),
  nori: m(35, 6, 5, 0),
  // fruit
  avocado: m(160, 2, 9, 15),
  guacamole: m(155, 2, 9, 14),
  olive: m(115, 1, 6, 11),
  coconut: m(354, 3, 15, 33),
  lemon: m(29, 1, 9, 0),
  lime: m(30, 1, 11, 0),
  orange: m(47, 1, 12, 0),
  'orange juice': m(45, 1, 10, 0),
  apple: m(52, 0, 14, 0),
  pineapple: m(50, 1, 13, 0),
  'pineapple juice': m(53, 0, 13, 0),
  banana: m(89, 1, 23, 0),
  berry: m(50, 1, 12, 0),
  redcurrant: m(56, 1, 14, 0),
  raisin: m(299, 3, 79, 0),
  sultana: m(299, 3, 79, 0),
  // Recipes use currants dried (Christmas cake); redcurrant is the fresh one.
  currant: m(283, 4, 74, 0),
  'dried fruit': m(280, 3, 70, 1),
  chestnut: m(213, 2, 46, 2),
  tamarind: m(239, 3, 63, 1),
  // nuts & seeds
  almond: m(579, 21, 22, 50),
  peanut: m(567, 26, 16, 49),
  'peanut butter': m(588, 25, 20, 50),
  cashew: m(553, 18, 30, 44),
  walnut: m(654, 15, 14, 65),
  hazelnut: m(628, 15, 17, 61),
  hazlenut: m(628, 15, 17, 61), // corpus misspelling
  'melon seed': m(557, 28, 15, 47),
  pecan: m(691, 9, 14, 72),
  'sesame seed': m(573, 18, 23, 50),
  tahini: m(592, 17, 21, 53),
  poppy: m(525, 18, 28, 42),
  'poppy seed': m(525, 18, 28, 42),
  'khus khus': m(525, 18, 28, 42), // poppy seed
  'sesame sauce': m(590, 17, 21, 53),
  'sesame paste': m(590, 17, 21, 53),
  // Dishes people log by name. Recipes never list these bare, so they only
  // catch the head noun of a typed meal ("chicken curry", "tomato soup").
  curry: m(130, 9, 6, 8),
  masala: m(130, 6, 10, 7),
  dal: m(352, 25, 63, 1), // dry, like the named dals; cooked via COOKED_YIELD
  daal: m(352, 25, 63, 1),
  soup: m(45, 2, 6, 2),
  stew: m(95, 7, 8, 4),
  salad: m(70, 2, 6, 4),
  chutney: m(150, 2, 30, 2),
  'mint chutney': m(60, 2, 8, 3),
  'green chutney': m(60, 2, 8, 3),
  'coriander chutney': m(60, 2, 8, 3),
  biryani: m(170, 7, 22, 6),
  pizza: m(266, 11, 33, 10),
  burger: m(250, 13, 24, 11),
  sandwich: m(250, 12, 28, 10),
  // liquids, sauces, condiments
  'coconut milk': m(230, 2, 6, 24),
  stock: m(5, 0, 0, 0),
  broth: m(5, 0, 0, 0),
  wine: m(83, 0, 3, 0),
  sherry: m(116, 0, 1, 0),
  brandy: m(231, 0, 0, 0),
  'grand marnier': m(250, 0, 22, 0),
  liqueur: m(250, 0, 22, 0),
  stout: m(50, 0, 5, 0),
  vinegar: m(18, 0, 0, 0),
  soy: m(53, 8, 5, 0),
  'oyster sauce': m(51, 1, 11, 0),
  'hot sauce': m(11, 1, 2, 0),
  hotsauce: m(11, 1, 2, 0),
  'barbecue sauce': m(172, 1, 41, 1),
  'barbeque sauce': m(172, 1, 41, 1),
  'bbq sauce': m(172, 1, 41, 1),
  marinara: m(50, 2, 8, 2),
  passata: m(24, 1, 5, 0),
  salsa: m(36, 2, 7, 0),
  vinaigrette: m(450, 0, 10, 45),
  gochujang: m(200, 5, 42, 2),
  doubanjiang: m(180, 10, 20, 6),
  mirin: m(240, 0, 43, 0),
  miso: m(198, 13, 25, 6),
  'caesar dressing': m(542, 2, 3, 58),
  'protein powder': m(390, 78, 8, 5),
  mustard: m(66, 4, 5, 4),
  vanilla: m(288, 0, 13, 0),
  'black tea': m(1, 0, 0, 0),
  'green tea': m(1, 0, 0, 0),
  coffee: m(2, 0, 0, 0),
  salt: zero,
  water: zero,
  // spices & herbs — calorically negligible at recipe quantities
  cumin: zero,
  coriander: zero,
  turmeric: zero,
  paprika: zero,
  cinnamon: zero,
  oregano: zero,
  basil: zero,
  thyme: zero,
  parsley: zero,
  rosemary: zero,
  dill: zero,
  sage: zero,
  allspice: zero,
  herb: zero,
  mint: m(44, 3, 8, 1),
  bay: zero,
  clove: zero,
  cardamom: zero,
  fenugreek: zero,
  saffron: zero,
  // Spice mixes, pastes and leaves are named in full; the bare words "curry"
  // and "masala" mean the dish (a logged "chicken curry" was 0 kcal when bare
  // "curry" was a spice).
  garam: zero,
  'garam masala': zero,
  'chaat masala': zero,
  'chole masala': zero,
  'biryani masala': zero,
  'tandoori masala': zero,
  'pav bhaji masala': zero,
  'sambar masala': zero,
  'kitchen king masala': zero,
  'masala powder': zero,
  'curry powder': zero,
  'curry leaf': zero,
  'curry leaves': zero,
  'curry paste': m(100, 2, 10, 6),
  'curry roux': m(500, 6, 45, 35),
  nutmeg: m(525, 6, 49, 36),
  'star anise': zero,
  'five spice': zero,
  spice: zero,
  seasoning: zero,
  'sambar powder': zero,
  'rasam powder': zero,
  'food colouring': zero,
  'food coloring': zero,
  ajwain: zero,
  asafoetida: zero,
  hing: zero,
  amchur: zero,
  'baking soda': zero,
  bicarbonate: zero,
};

/** Cooked weight per dry weight — divide dry per-100g by this when eaten cooked. */
export const COOKED_YIELD: Record<string, number> = {
  rice: 2.8,
  pasta: 2.35,
  spaghetti: 2.35,
  macaroni: 2.35,
  penne: 2.35,
  rigatoni: 2.35,
  fusilli: 2.35,
  linguine: 2.35,
  tagliatelle: 2.35,
  lasagne: 2.35,
  lasagna: 2.35,
  vermicelli: 2.35,
  noodle: 2.6,
  couscous: 3.3,
  bulgur: 2.9,
  barley: 2.8,
  quinoa: 3,
  lentil: 3,
  'urad dal': 3,
  'chana dal': 3,
  'toor dal': 3,
  'moong dal': 3,
  dal: 3,
  daal: 3,
};

/** Grams per ml of the cooked food, where it differs from the dry density. */
export const COOKED_DENSITY: Record<string, number> = {
  pasta: 0.58, spaghetti: 0.58, macaroni: 0.58, penne: 0.58, rigatoni: 0.58,
  fusilli: 0.58, linguine: 0.58, tagliatelle: 0.58, vermicelli: 0.58,
  noodle: 0.6, couscous: 0.66, quinoa: 0.77, bulgur: 0.76,
};

/**
 * Grams per ml, for volume measures. A cup is 240 ml of *something*: 125 g of
 * flour, 25 g of mint, 250 g of milk. Water density was assumed before, which
 * weighed a cup of mint at 240 g. Foods not listed default to 1.
 */
export const DENSITY: Record<string, number> = {
  // flours & powders
  flour: 0.53, 'rice flour': 0.66, 'gram flour': 0.38, besan: 0.38,
  cornflour: 0.53, cornstarch: 0.53, starch: 0.53, semolina: 0.7, rava: 0.7,
  cocoa: 0.36, cacao: 0.36, 'custard powder': 0.53,
  // sugars
  sugar: 0.83, 'brown sugar': 0.9, 'caster sugar': 0.86, 'icing sugar': 0.5,
  'powdered sugar': 0.5, 'confectioners sugar': 0.5,
  honey: 1.42, syrup: 1.33, treacle: 1.4, molasses: 1.4, jam: 1.3,
  // grains & pulses
  rice: 0.78, poha: 0.3, 'rice krispies': 0.12, oat: 0.38, oatmeal: 0.38,
  granola: 0.5, quinoa: 0.72, couscous: 0.73, bulgur: 0.6, barley: 0.8,
  lentil: 0.8, dal: 0.8, chickpea: 0.68, bean: 0.72, sprout: 0.44, sago: 0.64,
  pasta: 0.4, macaroni: 0.44, noodle: 0.4,
  // fats & dairy
  butter: 0.95, ghee: 0.9, shortening: 0.8, lard: 0.9, oil: 0.92,
  cheese: 0.42, cheddar: 0.42, parmesan: 0.42, mozzarella: 0.47, feta: 0.6,
  paneer: 0.55, 'cream cheese': 1, milk: 1.03, cream: 1, yogurt: 1.03, yoghurt: 1.03,
  // nuts, seeds, dried fruit
  almond: 0.6, cashew: 0.58, peanut: 0.6, walnut: 0.42, pecan: 0.42,
  hazelnut: 0.57, pistachio: 0.52, nut: 0.55, seed: 0.6, raisin: 0.6,
  sultana: 0.6, currant: 0.6, 'dried fruit': 0.6, date: 0.6, coconut: 0.35,
  'peanut butter': 1.07, tahini: 1,
  // baking & snacks
  chocolate: 0.7, 'chocolate chip': 0.7, breadcrumb: 0.45, panko: 0.25,
  crouton: 0.13, boondi: 0.4, cereal: 0.15,
  // herbs & leaves
  mint: 0.1, coriander: 0.1, cilantro: 0.1, parsley: 0.1, basil: 0.1, dill: 0.1,
  'curry leaves': 0.1, spinach: 0.12, kale: 0.28, lettuce: 0.2, cabbage: 0.3,
  // chopped vegetables & fruit
  onion: 0.66, tomato: 0.75, pepper: 0.6, capsicum: 0.6, carrot: 0.54,
  celery: 0.5, cucumber: 0.55, mushroom: 0.3, broccoli: 0.38, cauliflower: 0.45,
  potato: 0.63, courgette: 0.52, zucchini: 0.52, aubergine: 0.35, eggplant: 0.35,
  pea: 0.6, corn: 0.65, sweetcorn: 0.65, olive: 0.56, berry: 0.6, apple: 0.5,
  mango: 0.7, pineapple: 0.7, banana: 0.63, vegetable: 0.55,
  // meat & fish, chopped or shredded
  chicken: 0.6, beef: 0.6, 'corned beef': 0.6, pork: 0.6, lamb: 0.6, bacon: 0.5,
  ham: 0.6, shrimp: 0.6, prawn: 0.6, tofu: 0.9,
  // liquids listed so a meat word can't claim them ("chicken stock" is stock)
  stock: 1, broth: 1, water: 1, juice: 1.04, sauce: 1.1, wine: 1, vinegar: 1,
  soup: 1, coffee: 1, tea: 1, beer: 1, extract: 1, essence: 1, dressing: 1,
  paste: 1.1, puree: 1.05, 'coconut milk': 1, 'coconut cream': 1,
  // dishes
  curry: 1, masala: 1, stew: 1, chutney: 1.05, salad: 0.3, biryani: 0.8,
};

// Typical piece weights for count-only measures ("2 Onions", "3 Eggs").
export const PIECE_GRAMS: Record<string, number> = {
  egg: 50, onion: 110, 'red onion': 110, tomato: 120, 'cherry tomato': 17,
  potato: 170, carrot: 60, garlic: 5, lemon: 60, lime: 45, orange: 130,
  banana: 120, apple: 180, pear: 180, peach: 150, mango: 200, kiwi: 75, fig: 50,
  plantain: 180, avocado: 150, olive: 4, strawberry: 12,
  chilli: 15, chili: 15, 'green chilli': 5, pepper: 120, capsicum: 150,
  jalapeno: 14, 'jalapeño': 14, courgette: 200, zucchini: 200, aubergine: 300,
  eggplant: 300, 'egg plant': 300, leek: 150, celery: 40, lemongrass: 20,
  broccoli: 300, cauliflower: 600, cabbage: 900, lettuce: 300, cucumber: 300,
  ginger: 15, 'spring onion': 15, scallion: 15, shallot: 30, mushroom: 18,
  'sun-dried tomato': 6, 'sun dried tomato': 6,
  // Small items the 60 g default turned into kilos ("15 almonds" → 900 g).
  almond: 1.2, cashew: 1.5, walnut: 4, peanut: 1, pistachio: 0.7, raisin: 0.5,
  date: 7, cardamom: 0.2, clove: 0.2, peppercorn: 0.1, 'dried chil': 0.5,
  'star anise': 0.5, nutmeg: 7, cinnamon: 3, bay: 0.2,
  // proteins
  prawn: 15, shrimp: 12, anchovy: 4, 'anchovy fillet': 4, bacon: 25,
  sausage: 70, 'chicken breast': 170, 'chicken thigh': 110, 'chicken leg': 250,
  'chicken drumstick': 110, 'chicken wing': 90, 'lamb chop': 100, 'pork chop': 200,
  steak: 250, fillet: 150, 'lamb leg': 2000, 'leg of lamb': 2000, kidney: 60,
  // breads & bakes
  tortilla: 45, 'taco shell': 13, pita: 60, bun: 60, roti: 40, chapati: 40,
  paratha: 80, naan: 90, baguette: 250, flatbread: 60, wonton: 8,
  digestive: 15, biscuit: 13, meringue: 15, 'mars bar': 51,
  'brussels sprout': 10, oyster: 15, 'black pudding': 40, coconut: 400, vanilla: 2,
  challot: 30, fennel: 250, 'fennel bulb': 250, squash: 600, nori: 3,
  'egg yolk': 17, 'egg white': 33,
  // Weightless-but-countable items: only their grams (for servings) matter.
  'curry leaf': 0.1, 'curry leaves': 0.1, 'stock cube': 10, 'bouillon cube': 10,
  // An unmeasured herb ("Parsley (chopped)") is a garnish, not 50 g.
  chives: 5, parsley: 5, coriander: 5, cilantro: 5, mint: 5, basil: 5, dill: 5,
  // A bare count of oil means spoonfuls ("Rapeseed Oil (1)").
  oil: 15,
};

/** Units whose grams are a volume in ml — scaled by DENSITY. */
export const VOLUME_ML: Record<string, number> = {
  ml: 1,
  l: 1000, litre: 1000, liter: 1000,
  tsp: 5, teaspoon: 5,
  tbsp: 15, tbs: 15, tbls: 15, tblsp: 15, tablespoon: 15,
  'fl oz': 30,
  cup: 240,
  pint: 473, pt: 473,
  // Everyday portions people type when logging ("1 bowl of dal").
  bowl: 250, glass: 250,
};

/** Units that are already weights, or fixed-size things. */
export const UNIT_GRAMS: Record<string, number> = {
  g: 1, gram: 1, gr: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28, ounce: 28,
  lb: 454, pound: 454,
  can: 400, tin: 400,
  dash: 1, pinch: 1, sprinkle: 1, drizzle: 5, splash: 10, drop: 0.05,
  clove: 5,
  rasher: 25,
  floret: 10,
  handful: 40,
  sprig: 2, leaves: 2, leaf: 1, bunch: 60,
  scoop: 30,
  cm: 5, // "5cm piece" of ginger, galangal, cinnamon
  thumb: 15,
};

/**
 * Units whose weight depends on the food: a stick of butter is 113 g, of
 * cinnamon 3 g; a head of garlic 50 g, of cabbage 900 g.
 */
export const CONTEXT_UNITS: Record<string, { byFood: Record<string, number>; otherwise: number }> = {
  stick: { byFood: { butter: 113, cinnamon: 3, celery: 40 }, otherwise: 40 },
  head: {
    byFood: { garlic: 50, lettuce: 300, cabbage: 900, broccoli: 300, cauliflower: 600 },
    otherwise: 300,
  },
  knob: { byFood: { ginger: 15 }, otherwise: 10 }, // butter
  fillet: { byFood: { anchovy: 4 }, otherwise: 150 },
  packet: { byFood: { noodle: 85, rice: 250, grain: 250, yeast: 7 }, otherwise: 100 },
  pack: { byFood: { noodle: 85, rice: 250, grain: 250, yeast: 7 }, otherwise: 100 },
  sachet: { byFood: { yeast: 7 }, otherwise: 10 },
  pouch: { byFood: { rice: 250, grain: 250 }, otherwise: 250 },
  bag: { byFood: { noodle: 400, spinach: 200, salad: 120 }, otherwise: 200 },
  slice: {
    byFood: { pizza: 107, cake: 80, pie: 120, cheese: 20, ham: 15, bacon: 25, tomato: 20, lemon: 8, lime: 8 },
    otherwise: 30, // bread
  },
  cube: { byFood: { roux: 20, stock: 10, bouillon: 10 }, otherwise: 10 },
  sheet: { byFood: { nori: 3, lasagne: 20, lasagna: 20, pastry: 320, filo: 10, phyllo: 10 }, otherwise: 20 },
};
