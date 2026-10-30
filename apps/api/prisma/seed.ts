import { PrismaClient } from '@prisma/client';
import { getOrComputeNutrition } from '../src/services/nutritionData.js';

const prisma = new PrismaClient();

// No demo users are seeded — accounts are created via sign up.

// Demo recipes: seeded so search, "Recipe of the Day", meal suggestions, and
// the meal plan all work offline (no TheMealDB / AI needed). externalId
// "demo-N" keeps reseeding idempotent.
const DEMO_RECIPES = [
  {
    name: 'Avocado Toast with Poached Egg',
    category: 'Breakfast',
    cuisine: 'American',
    prepMinutes: 5,
    cookMinutes: 10,
    instructions:
      'Toast the sourdough until golden.\n\nMash the avocado with lemon, salt, and chili flakes, then spread on the toast.\n\nPoach the eggs for 3 minutes and set on top. Finish with black pepper.',
    ingredients: [
      { name: 'Sourdough bread', measure: '2 slices' },
      { name: 'Avocado', measure: '1 ripe' },
      { name: 'Eggs', measure: '2' },
      { name: 'Lemon juice', measure: '1 tsp' },
      { name: 'Chili flakes', measure: '1 pinch' },
    ],
  },
  {
    name: 'Greek Yogurt Berry Bowl',
    category: 'Breakfast',
    cuisine: 'Greek',
    prepMinutes: 5,
    cookMinutes: 0,
    instructions:
      'Spoon the yogurt into a bowl.\n\nTop with mixed berries, granola, and a drizzle of honey.\n\nSprinkle chia seeds and serve.',
    ingredients: [
      { name: 'Greek yogurt', measure: '200 g' },
      { name: 'Mixed berries', measure: '100 g' },
      { name: 'Granola', measure: '40 g' },
      { name: 'Honey', measure: '1 tbsp' },
      { name: 'Chia seeds', measure: '1 tsp' },
    ],
  },
  {
    name: 'Grilled Chicken Caesar Salad',
    category: 'Lunch',
    cuisine: 'Italian',
    prepMinutes: 15,
    cookMinutes: 12,
    instructions:
      'Season and grill the chicken breast until cooked through, then slice.\n\nToss chopped romaine with Caesar dressing and parmesan.\n\nTop with chicken and croutons.',
    ingredients: [
      { name: 'Chicken breast', measure: '250 g' },
      { name: 'Romaine lettuce', measure: '1 head' },
      { name: 'Caesar dressing', measure: '3 tbsp' },
      { name: 'Parmesan', measure: '30 g' },
      { name: 'Croutons', measure: '1 cup' },
    ],
  },
  {
    name: 'Quinoa Buddha Bowl',
    category: 'Lunch',
    cuisine: 'Vegetarian',
    prepMinutes: 15,
    cookMinutes: 20,
    instructions:
      'Cook the quinoa in salted water until fluffy.\n\nRoast the chickpeas and sweet potato with olive oil until crisp.\n\nAssemble with spinach and drizzle tahini over the top.',
    ingredients: [
      { name: 'Quinoa', measure: '150 g' },
      { name: 'Chickpeas', measure: '1 can' },
      { name: 'Sweet potato', measure: '1 medium' },
      { name: 'Baby spinach', measure: '2 cups' },
      { name: 'Tahini', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Salmon with Roasted Vegetables',
    category: 'Dinner',
    cuisine: 'Mediterranean',
    prepMinutes: 10,
    cookMinutes: 25,
    instructions:
      'Roast broccoli and bell peppers with olive oil at 200°C for 20 minutes.\n\nSeason the salmon and roast alongside for the final 12 minutes.\n\nFinish with a squeeze of lemon.',
    ingredients: [
      { name: 'Salmon fillet', measure: '2 x 150 g' },
      { name: 'Broccoli', measure: '200 g' },
      { name: 'Bell peppers', measure: '2' },
      { name: 'Olive oil', measure: '2 tbsp' },
      { name: 'Lemon', measure: '1' },
    ],
  },
  {
    name: 'Spaghetti Aglio e Olio',
    category: 'Dinner',
    cuisine: 'Italian',
    prepMinutes: 5,
    cookMinutes: 15,
    instructions:
      'Cook the spaghetti until al dente, reserving some pasta water.\n\nGently fry sliced garlic and chili in olive oil until fragrant.\n\nToss the pasta in the oil with a splash of pasta water and parsley.',
    ingredients: [
      { name: 'Spaghetti', measure: '200 g' },
      { name: 'Garlic', measure: '4 cloves' },
      { name: 'Chili flakes', measure: '1 tsp' },
      { name: 'Olive oil', measure: '4 tbsp' },
      { name: 'Parsley', measure: '1 handful' },
    ],
  },
  {
    name: 'Veggie Stir-Fry with Tofu',
    category: 'Dinner',
    cuisine: 'Asian',
    prepMinutes: 15,
    cookMinutes: 12,
    instructions:
      'Press and cube the tofu, then pan-fry until golden.\n\nStir-fry mixed vegetables on high heat for 4 minutes.\n\nAdd soy sauce and the tofu, toss, and serve over rice.',
    ingredients: [
      { name: 'Firm tofu', measure: '250 g' },
      { name: 'Mixed vegetables', measure: '400 g' },
      { name: 'Soy sauce', measure: '3 tbsp' },
      { name: 'Ginger', measure: '1 tbsp' },
      { name: 'Jasmine rice', measure: '200 g' },
    ],
  },
  {
    name: 'Banana Oat Protein Smoothie',
    category: 'Snack',
    cuisine: 'American',
    prepMinutes: 5,
    cookMinutes: 0,
    instructions:
      'Add all ingredients to a blender.\n\nBlend until smooth, adding milk to reach the consistency you like.\n\nServe chilled.',
    ingredients: [
      { name: 'Banana', measure: '1' },
      { name: 'Rolled oats', measure: '40 g' },
      { name: 'Protein powder', measure: '1 scoop' },
      { name: 'Milk', measure: '250 ml' },
      { name: 'Peanut butter', measure: '1 tbsp' },
    ],
  },

  // ---------- Indian ----------
  {
    name: 'Butter Chicken (Murgh Makhani)',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 20,
    cookMinutes: 30,
    instructions:
      'Cut the chicken into bite-size pieces and marinate in yogurt, half the garam masala, turmeric, chili powder, and salt for at least 15 minutes.\n\nHeat 1 tbsp butter in a large pan over medium-high heat and sear the chicken in batches until browned but not fully cooked. Set aside.\n\nIn the same pan, melt the remaining butter and soften the onion for 5 minutes. Add the ginger-garlic paste and cook for 1 minute until fragrant.\n\nStir in the tomato purée, remaining garam masala, and a splash of water. Simmer for 10 minutes until the sauce darkens and thickens.\n\nReturn the chicken with any juices, pour in the cream, and simmer gently for 8-10 minutes until the chicken is cooked through.\n\nFinish with kasuri methi and a knob of butter. Serve with basmati rice or naan.',
    ingredients: [
      { name: 'Chicken thighs', measure: '500 g' },
      { name: 'Plain yogurt', measure: '100 g' },
      { name: 'Butter', measure: '3 tbsp' },
      { name: 'Onion', measure: '1 large, finely chopped' },
      { name: 'Ginger-garlic paste', measure: '2 tbsp' },
      { name: 'Tomato purée', measure: '400 g' },
      { name: 'Heavy cream', measure: '150 ml' },
      { name: 'Garam masala', measure: '2 tsp' },
      { name: 'Turmeric', measure: '1/2 tsp' },
      { name: 'Kashmiri chili powder', measure: '1 tsp' },
      { name: 'Kasuri methi (dried fenugreek)', measure: '1 tsp' },
    ],
  },
  {
    name: 'Chana Masala',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 10,
    cookMinutes: 30,
    instructions:
      'Heat the oil in a deep pan and fry the cumin seeds until they sizzle.\n\nAdd the chopped onion and cook until golden, about 8 minutes. Stir in the ginger-garlic paste and green chili and cook 1 minute more.\n\nAdd the chopped tomatoes, coriander powder, turmeric, chili powder, and salt. Cook until the tomatoes break down and the oil separates, about 8 minutes.\n\nTip in the drained chickpeas with 250 ml water. Simmer for 12-15 minutes, mashing a few chickpeas against the pan to thicken the gravy.\n\nSprinkle over the garam masala and amchur, then stir through fresh coriander. Serve with rice or roti and lemon wedges.',
    ingredients: [
      { name: 'Chickpeas', measure: '2 cans (800 g)' },
      { name: 'Onion', measure: '1 large, chopped' },
      { name: 'Tomatoes', measure: '3, chopped' },
      { name: 'Ginger-garlic paste', measure: '1.5 tbsp' },
      { name: 'Green chili', measure: '1, slit' },
      { name: 'Cumin seeds', measure: '1 tsp' },
      { name: 'Coriander powder', measure: '2 tsp' },
      { name: 'Turmeric', measure: '1/2 tsp' },
      { name: 'Garam masala', measure: '1 tsp' },
      { name: 'Amchur (dry mango powder)', measure: '1/2 tsp' },
      { name: 'Vegetable oil', measure: '2 tbsp' },
      { name: 'Fresh coriander', measure: '1 handful' },
    ],
  },
  {
    name: 'Palak Paneer',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 15,
    cookMinutes: 25,
    instructions:
      'Blanch the spinach in boiling water for 2 minutes, plunge into ice water, then blend to a smooth purée.\n\nPan-fry the paneer cubes in 1 tbsp ghee until lightly golden on all sides. Set aside.\n\nIn the same pan, heat the remaining ghee and fry the cumin seeds, then the onion until soft. Add the ginger-garlic paste and cook 1 minute.\n\nAdd the tomato and spices and cook until the tomato breaks down, about 5 minutes.\n\nPour in the spinach purée with a splash of water and simmer 5 minutes. Gently fold in the paneer and cream and warm through for 3-4 minutes.\n\nSeason, finish with a swirl of cream, and serve hot with roti or jeera rice.',
    ingredients: [
      { name: 'Paneer', measure: '250 g, cubed' },
      { name: 'Baby spinach', measure: '400 g' },
      { name: 'Onion', measure: '1, finely chopped' },
      { name: 'Tomato', measure: '1, chopped' },
      { name: 'Ginger-garlic paste', measure: '1 tbsp' },
      { name: 'Cumin seeds', measure: '1 tsp' },
      { name: 'Garam masala', measure: '1 tsp' },
      { name: 'Turmeric', measure: '1/4 tsp' },
      { name: 'Ghee', measure: '2 tbsp' },
      { name: 'Heavy cream', measure: '3 tbsp' },
    ],
  },
  {
    name: 'Vegetable Biryani',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 25,
    cookMinutes: 40,
    instructions:
      'Soak the basmati rice for 20 minutes, then parboil in salted water with the whole spices until 70% cooked. Drain.\n\nHeat ghee in a heavy pot and fry the sliced onion until deep golden. Remove half for layering.\n\nAdd the ginger-garlic paste, then the mixed vegetables, yogurt, biryani masala, turmeric, and salt. Cook for 8 minutes until the vegetables are just tender.\n\nLayer the rice over the vegetables, scatter with the reserved fried onions, mint, coriander, and saffron milk.\n\nCover tightly and cook on the lowest heat (dum) for 20 minutes. Rest 5 minutes, then fluff gently from the sides and serve with raita.',
    ingredients: [
      { name: 'Basmati rice', measure: '300 g' },
      { name: 'Mixed vegetables (carrot, beans, peas, potato)', measure: '400 g' },
      { name: 'Onion', measure: '2, thinly sliced' },
      { name: 'Plain yogurt', measure: '100 g' },
      { name: 'Ginger-garlic paste', measure: '1.5 tbsp' },
      { name: 'Biryani masala', measure: '2 tsp' },
      { name: 'Turmeric', measure: '1/2 tsp' },
      { name: 'Whole spices (bay, cardamom, cinnamon, cloves)', measure: '1 tbsp' },
      { name: 'Saffron in warm milk', measure: '2 tbsp' },
      { name: 'Mint and coriander leaves', measure: '1 cup' },
      { name: 'Ghee', measure: '3 tbsp' },
    ],
  },
  {
    name: 'Dal Tadka',
    category: 'Lunch',
    cuisine: 'Indian',
    prepMinutes: 10,
    cookMinutes: 30,
    instructions:
      'Rinse the lentils and simmer with turmeric, salt, and 750 ml water until soft and creamy, about 20 minutes. Lightly mash.\n\nFor the tadka, heat ghee in a small pan. Add cumin and mustard seeds and let them crackle, then add the garlic, dried red chilies, and curry leaves and fry until the garlic is golden.\n\nStir in the chopped tomato and chili powder and cook 3 minutes.\n\nPour the sizzling tadka over the dal, stir, and simmer 5 minutes to bring it together.\n\nFinish with fresh coriander and a squeeze of lemon. Serve with steamed rice.',
    ingredients: [
      { name: 'Yellow lentils (toor or moong dal)', measure: '250 g' },
      { name: 'Turmeric', measure: '1/2 tsp' },
      { name: 'Ghee', measure: '2 tbsp' },
      { name: 'Cumin seeds', measure: '1 tsp' },
      { name: 'Mustard seeds', measure: '1/2 tsp' },
      { name: 'Garlic', measure: '4 cloves, sliced' },
      { name: 'Dried red chilies', measure: '2' },
      { name: 'Curry leaves', measure: '8' },
      { name: 'Tomato', measure: '1, chopped' },
      { name: 'Red chili powder', measure: '1/2 tsp' },
      { name: 'Fresh coriander', measure: '2 tbsp' },
      { name: 'Lemon', measure: '1/2' },
    ],
  },
  {
    name: 'Aloo Gobi',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 15,
    cookMinutes: 25,
    instructions:
      'Cut the potatoes into small cubes and the cauliflower into florets.\n\nHeat the oil in a wide pan and crackle the cumin seeds. Add the onion and cook until soft.\n\nStir in the ginger, turmeric, coriander powder, and chili powder, then add the potatoes. Cover and cook 8 minutes, stirring occasionally.\n\nAdd the cauliflower and tomato, season with salt, cover, and cook 12-15 minutes on low until both vegetables are tender but not mushy.\n\nSprinkle with garam masala and fresh coriander. Serve with roti or paratha.',
    ingredients: [
      { name: 'Potatoes', measure: '2 medium' },
      { name: 'Cauliflower', measure: '1 small head' },
      { name: 'Onion', measure: '1, chopped' },
      { name: 'Tomato', measure: '1, chopped' },
      { name: 'Ginger', measure: '1 tbsp, grated' },
      { name: 'Cumin seeds', measure: '1 tsp' },
      { name: 'Turmeric', measure: '1/2 tsp' },
      { name: 'Coriander powder', measure: '1.5 tsp' },
      { name: 'Red chili powder', measure: '1/2 tsp' },
      { name: 'Garam masala', measure: '1/2 tsp' },
      { name: 'Vegetable oil', measure: '3 tbsp' },
    ],
  },
  {
    name: 'Chicken Tikka Masala',
    category: 'Dinner',
    cuisine: 'Indian',
    prepMinutes: 25,
    cookMinutes: 35,
    instructions:
      'Marinate the chicken chunks in yogurt, lemon juice, half the spices, and salt for at least 20 minutes (overnight is better).\n\nThread onto skewers or spread on a tray and grill under high heat until charred at the edges, about 10 minutes.\n\nMeanwhile, melt butter in a pan and soften the onion. Add ginger-garlic paste and the remaining spices and cook 2 minutes.\n\nAdd the tomato purée and simmer 10 minutes until thick. Blend smooth for a restaurant-style sauce.\n\nStir in the cream and grilled chicken and simmer 8 minutes. Balance with a pinch of sugar if needed.\n\nGarnish with coriander and serve with naan or basmati rice.',
    ingredients: [
      { name: 'Chicken breast', measure: '500 g, cubed' },
      { name: 'Plain yogurt', measure: '150 g' },
      { name: 'Lemon juice', measure: '1 tbsp' },
      { name: 'Onion', measure: '1 large' },
      { name: 'Ginger-garlic paste', measure: '2 tbsp' },
      { name: 'Tomato purée', measure: '400 g' },
      { name: 'Heavy cream', measure: '120 ml' },
      { name: 'Garam masala', measure: '2 tsp' },
      { name: 'Ground cumin', measure: '1 tsp' },
      { name: 'Paprika', measure: '2 tsp' },
      { name: 'Butter', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Masala Omelette',
    category: 'Breakfast',
    cuisine: 'Indian',
    prepMinutes: 5,
    cookMinutes: 8,
    instructions:
      'Whisk the eggs with a splash of water and salt.\n\nStir in the chopped onion, tomato, green chili, coriander, and turmeric.\n\nHeat the oil in a nonstick pan over medium heat, pour in the eggs, and swirl to cover the base.\n\nCook 2-3 minutes until nearly set, fold in half, and cook 1 minute more.\n\nServe hot with buttered toast or roti and a cup of chai.',
    ingredients: [
      { name: 'Eggs', measure: '3' },
      { name: 'Onion', measure: '1/2 small, finely chopped' },
      { name: 'Tomato', measure: '1/2, finely chopped' },
      { name: 'Green chili', measure: '1, minced' },
      { name: 'Fresh coriander', measure: '1 tbsp' },
      { name: 'Turmeric', measure: '1/4 tsp' },
      { name: 'Vegetable oil', measure: '1 tbsp' },
    ],
  },

  // ---------- Chinese ----------
  {
    name: 'Kung Pao Chicken',
    category: 'Dinner',
    cuisine: 'Chinese',
    prepMinutes: 20,
    cookMinutes: 12,
    instructions:
      'Toss the diced chicken with soy sauce, Shaoxing wine, and cornstarch; marinate 15 minutes.\n\nMix the sauce: soy sauce, black vinegar, sugar, and 2 tbsp water.\n\nHeat oil in a wok over high heat. Fry the dried chilies and Sichuan peppercorns for 30 seconds until fragrant.\n\nAdd the chicken and stir-fry until nearly cooked, 3-4 minutes. Add garlic, ginger, and the white parts of the scallions.\n\nPour in the sauce and toss until glossy and thickened. Stir in the roasted peanuts and scallion greens and serve with steamed rice.',
    ingredients: [
      { name: 'Chicken thighs', measure: '450 g, diced' },
      { name: 'Roasted peanuts', measure: '75 g' },
      { name: 'Dried red chilies', measure: '8' },
      { name: 'Sichuan peppercorns', measure: '1 tsp' },
      { name: 'Garlic', measure: '3 cloves, sliced' },
      { name: 'Ginger', measure: '1 tbsp, minced' },
      { name: 'Scallions', measure: '4' },
      { name: 'Soy sauce', measure: '3 tbsp' },
      { name: 'Chinese black vinegar', measure: '1 tbsp' },
      { name: 'Shaoxing wine', measure: '1 tbsp' },
      { name: 'Sugar', measure: '2 tsp' },
      { name: 'Cornstarch', measure: '1 tbsp' },
    ],
  },
  {
    name: 'Vegetable Fried Rice',
    category: 'Lunch',
    cuisine: 'Chinese',
    prepMinutes: 10,
    cookMinutes: 10,
    instructions:
      'Use cold, day-old rice for the best texture; break up any clumps.\n\nHeat 1 tbsp oil in a wok, scramble the eggs until just set, and remove.\n\nAdd the remaining oil and stir-fry the garlic, carrot, and peas for 2 minutes on high heat.\n\nAdd the rice and toss constantly for 3 minutes so every grain is coated and hot.\n\nSeason with soy sauce, sesame oil, and white pepper. Return the eggs, toss through the scallions, and serve immediately.',
    ingredients: [
      { name: 'Cooked jasmine rice', measure: '450 g (day-old)' },
      { name: 'Eggs', measure: '2' },
      { name: 'Carrot', measure: '1, diced' },
      { name: 'Frozen peas', measure: '100 g' },
      { name: 'Garlic', measure: '2 cloves, minced' },
      { name: 'Scallions', measure: '3, sliced' },
      { name: 'Soy sauce', measure: '2 tbsp' },
      { name: 'Sesame oil', measure: '1 tsp' },
      { name: 'Vegetable oil', measure: '2 tbsp' },
      { name: 'White pepper', measure: '1/4 tsp' },
    ],
  },
  {
    name: 'Mapo Tofu',
    category: 'Dinner',
    cuisine: 'Chinese',
    prepMinutes: 10,
    cookMinutes: 15,
    instructions:
      'Cut the tofu into 2 cm cubes and steep in hot salted water while you cook.\n\nHeat oil in a wok and fry the ground pork until crisp. Add the doubanjiang and cook until the oil turns red.\n\nAdd garlic, ginger, and fermented black beans and fry 1 minute.\n\nPour in the stock, add the drained tofu, and simmer gently 5 minutes, nudging rather than stirring.\n\nThicken with the cornstarch slurry, finish with ground Sichuan pepper and scallions, and serve over rice.',
    ingredients: [
      { name: 'Soft tofu', measure: '450 g' },
      { name: 'Ground pork', measure: '150 g' },
      { name: 'Doubanjiang (chili bean paste)', measure: '2 tbsp' },
      { name: 'Fermented black beans', measure: '1 tbsp' },
      { name: 'Garlic', measure: '3 cloves, minced' },
      { name: 'Ginger', measure: '1 tbsp, minced' },
      { name: 'Chicken stock', measure: '250 ml' },
      { name: 'Cornstarch', measure: '1 tbsp, in 2 tbsp water' },
      { name: 'Ground Sichuan pepper', measure: '1/2 tsp' },
      { name: 'Scallions', measure: '2, sliced' },
    ],
  },
  {
    name: 'Sweet and Sour Pork',
    category: 'Dinner',
    cuisine: 'Chinese',
    prepMinutes: 20,
    cookMinutes: 15,
    instructions:
      'Toss the pork in soy sauce, then coat in cornstarch. Fry in hot oil until golden and crisp, about 5 minutes; drain.\n\nStir together ketchup, rice vinegar, sugar, soy sauce, and pineapple juice for the sauce.\n\nStir-fry the bell pepper and onion in 1 tbsp oil for 2 minutes, keeping them crisp.\n\nPour in the sauce and bubble until glossy, then add the pineapple chunks.\n\nReturn the pork, toss to coat, and serve immediately with rice.',
    ingredients: [
      { name: 'Pork shoulder', measure: '400 g, cubed' },
      { name: 'Cornstarch', measure: '60 g' },
      { name: 'Bell pepper', measure: '1, chunks' },
      { name: 'Onion', measure: '1/2, chunks' },
      { name: 'Pineapple chunks', measure: '150 g (+ 3 tbsp juice)' },
      { name: 'Ketchup', measure: '3 tbsp' },
      { name: 'Rice vinegar', measure: '2 tbsp' },
      { name: 'Sugar', measure: '2 tbsp' },
      { name: 'Soy sauce', measure: '1 tbsp' },
      { name: 'Vegetable oil', measure: 'for frying' },
    ],
  },
  {
    name: 'Chicken Chow Mein',
    category: 'Dinner',
    cuisine: 'Chinese',
    prepMinutes: 15,
    cookMinutes: 10,
    instructions:
      'Cook the noodles per the packet, drain, and toss with a little sesame oil.\n\nSlice the chicken thinly and toss with soy sauce and cornstarch.\n\nStir-fry the chicken in hot oil until just cooked, 3 minutes; set aside.\n\nStir-fry the cabbage, carrot, and bean sprouts for 2 minutes, then add the noodles and sauce (soy, oyster sauce, sugar).\n\nReturn the chicken, toss everything over high heat for 2 minutes, and finish with scallions.',
    ingredients: [
      { name: 'Egg noodles', measure: '250 g' },
      { name: 'Chicken breast', measure: '300 g' },
      { name: 'Cabbage', measure: '150 g, shredded' },
      { name: 'Carrot', measure: '1, julienned' },
      { name: 'Bean sprouts', measure: '100 g' },
      { name: 'Scallions', measure: '3' },
      { name: 'Soy sauce', measure: '3 tbsp' },
      { name: 'Oyster sauce', measure: '2 tbsp' },
      { name: 'Sesame oil', measure: '1 tsp' },
      { name: 'Cornstarch', measure: '2 tsp' },
    ],
  },

  // ---------- Mexican ----------
  {
    name: 'Chicken Tinga Tacos',
    category: 'Dinner',
    cuisine: 'Mexican',
    prepMinutes: 15,
    cookMinutes: 25,
    instructions:
      'Poach the chicken in salted water until cooked, about 15 minutes, then shred.\n\nBlend the tomatoes, chipotles with adobo, garlic, and oregano into a smooth sauce.\n\nSoften the sliced onion in oil, pour in the sauce, and simmer 8 minutes.\n\nFold in the shredded chicken and simmer 5 more minutes until saucy but not wet.\n\nWarm the tortillas, fill with tinga, and top with avocado, crumbled cheese, and coriander.',
    ingredients: [
      { name: 'Chicken breast', measure: '400 g' },
      { name: 'Tomatoes', measure: '3' },
      { name: 'Chipotle in adobo', measure: '2 + 1 tbsp sauce' },
      { name: 'Onion', measure: '1, sliced' },
      { name: 'Garlic', measure: '2 cloves' },
      { name: 'Dried oregano', measure: '1 tsp' },
      { name: 'Corn tortillas', measure: '8' },
      { name: 'Avocado', measure: '1' },
      { name: 'Queso fresco or feta', measure: '60 g' },
      { name: 'Fresh coriander', measure: '1 handful' },
    ],
  },
  {
    name: 'Beef Burrito Bowl',
    category: 'Lunch',
    cuisine: 'Mexican',
    prepMinutes: 15,
    cookMinutes: 15,
    instructions:
      'Cook the rice and stir through lime juice and chopped coriander.\n\nBrown the ground beef in a hot pan, then season with cumin, smoked paprika, chili powder, and salt. Add a splash of water and simmer 3 minutes.\n\nWarm the black beans with a pinch of cumin.\n\nAssemble bowls: rice, beef, beans, corn, pico de gallo, and avocado.\n\nFinish with cheese, a dollop of sour cream, and extra lime.',
    ingredients: [
      { name: 'Ground beef', measure: '400 g' },
      { name: 'Long-grain rice', measure: '200 g' },
      { name: 'Black beans', measure: '1 can' },
      { name: 'Sweetcorn', measure: '150 g' },
      { name: 'Pico de gallo (tomato, onion, coriander)', measure: '1 cup' },
      { name: 'Avocado', measure: '1' },
      { name: 'Ground cumin', measure: '2 tsp' },
      { name: 'Smoked paprika', measure: '1 tsp' },
      { name: 'Chili powder', measure: '1 tsp' },
      { name: 'Lime', measure: '2' },
      { name: 'Cheddar', measure: '50 g, grated' },
      { name: 'Sour cream', measure: '4 tbsp' },
    ],
  },
  {
    name: 'Huevos Rancheros',
    category: 'Breakfast',
    cuisine: 'Mexican',
    prepMinutes: 10,
    cookMinutes: 15,
    instructions:
      'Blitz the tomatoes, jalapeño, garlic, and half the onion, then simmer the salsa in 1 tbsp oil for 8 minutes until thickened. Season well.\n\nWarm the refried beans with a splash of water.\n\nFry the tortillas briefly in oil until pliable and lightly crisp; keep warm.\n\nFry the eggs sunny-side up.\n\nLayer each tortilla with beans, an egg, and warm salsa. Top with avocado, cheese, and coriander.',
    ingredients: [
      { name: 'Eggs', measure: '4' },
      { name: 'Corn tortillas', measure: '4' },
      { name: 'Refried beans', measure: '1 can' },
      { name: 'Tomatoes', measure: '4' },
      { name: 'Jalapeño', measure: '1' },
      { name: 'Onion', measure: '1/2' },
      { name: 'Garlic', measure: '2 cloves' },
      { name: 'Avocado', measure: '1' },
      { name: 'Queso fresco', measure: '50 g' },
      { name: 'Fresh coriander', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Chicken Quesadillas',
    category: 'Lunch',
    cuisine: 'Mexican',
    prepMinutes: 10,
    cookMinutes: 12,
    instructions:
      'Season the chicken with cumin, paprika, and salt, then pan-fry until cooked and slice thinly.\n\nSoften the pepper and onion in the same pan for 3 minutes.\n\nLay a tortilla in a dry pan, scatter half with cheese, chicken, and vegetables, and fold over.\n\nCook 2 minutes per side until golden and the cheese melts. Repeat.\n\nCut into wedges and serve with salsa, guacamole, and sour cream.',
    ingredients: [
      { name: 'Flour tortillas', measure: '4 large' },
      { name: 'Chicken breast', measure: '300 g' },
      { name: 'Monterey Jack or cheddar', measure: '150 g, grated' },
      { name: 'Bell pepper', measure: '1, sliced' },
      { name: 'Onion', measure: '1/2, sliced' },
      { name: 'Ground cumin', measure: '1 tsp' },
      { name: 'Smoked paprika', measure: '1 tsp' },
      { name: 'Salsa', measure: 'to serve' },
      { name: 'Guacamole', measure: 'to serve' },
    ],
  },

  // ---------- Thai ----------
  {
    name: 'Pad Thai',
    category: 'Dinner',
    cuisine: 'Thai',
    prepMinutes: 20,
    cookMinutes: 10,
    instructions:
      'Soak the rice noodles in warm water for 20 minutes until pliable; drain.\n\nStir together tamarind paste, fish sauce, and palm sugar for the sauce.\n\nStir-fry the shrimp in hot oil until pink; push aside and scramble the egg in the pan.\n\nAdd the noodles and sauce and toss over high heat for 2-3 minutes until the noodles absorb the sauce.\n\nToss through the bean sprouts, garlic chives, and half the peanuts.\n\nServe with the remaining peanuts, lime wedges, and chili flakes.',
    ingredients: [
      { name: 'Flat rice noodles', measure: '200 g' },
      { name: 'Shrimp', measure: '250 g' },
      { name: 'Eggs', measure: '2' },
      { name: 'Bean sprouts', measure: '150 g' },
      { name: 'Garlic chives or scallions', measure: '4' },
      { name: 'Tamarind paste', measure: '2 tbsp' },
      { name: 'Fish sauce', measure: '2 tbsp' },
      { name: 'Palm sugar', measure: '2 tbsp' },
      { name: 'Roasted peanuts', measure: '60 g, crushed' },
      { name: 'Lime', measure: '1' },
      { name: 'Vegetable oil', measure: '3 tbsp' },
    ],
  },
  {
    name: 'Thai Green Curry with Chicken',
    category: 'Dinner',
    cuisine: 'Thai',
    prepMinutes: 15,
    cookMinutes: 20,
    instructions:
      'Skim the thick cream from the top of the coconut milk into a hot pan and fry the green curry paste in it for 2 minutes until fragrant.\n\nAdd the sliced chicken and coat in the paste.\n\nPour in the remaining coconut milk, add the eggplant and bamboo shoots, and simmer 12 minutes.\n\nSeason with fish sauce and palm sugar; the curry should taste salty-sweet with heat behind it.\n\nStir in the basil leaves and kaffir lime leaves off the heat. Serve with jasmine rice.',
    ingredients: [
      { name: 'Chicken thighs', measure: '400 g, sliced' },
      { name: 'Green curry paste', measure: '3 tbsp' },
      { name: 'Coconut milk', measure: '400 ml' },
      { name: 'Thai eggplant or zucchini', measure: '200 g' },
      { name: 'Bamboo shoots', measure: '100 g' },
      { name: 'Fish sauce', measure: '2 tbsp' },
      { name: 'Palm sugar', measure: '1 tbsp' },
      { name: 'Thai basil', measure: '1 handful' },
      { name: 'Kaffir lime leaves', measure: '4' },
      { name: 'Jasmine rice', measure: 'to serve' },
    ],
  },
  {
    name: 'Tom Yum Soup',
    category: 'Lunch',
    cuisine: 'Thai',
    prepMinutes: 10,
    cookMinutes: 15,
    instructions:
      'Bring the stock to a boil with bruised lemongrass, galangal slices, and kaffir lime leaves; simmer 5 minutes to infuse.\n\nAdd the mushrooms and simmer 3 minutes.\n\nAdd the shrimp and cook just until pink, 2 minutes.\n\nTake off the heat and season with fish sauce, lime juice, and chili paste — taste for hot, sour, salty balance.\n\nScatter with coriander and serve immediately.',
    ingredients: [
      { name: 'Shrimp', measure: '300 g' },
      { name: 'Chicken or seafood stock', measure: '1 litre' },
      { name: 'Lemongrass', measure: '2 stalks' },
      { name: 'Galangal', measure: '5 slices' },
      { name: 'Kaffir lime leaves', measure: '5' },
      { name: 'Oyster mushrooms', measure: '150 g' },
      { name: 'Thai chili paste (nam prik pao)', measure: '1.5 tbsp' },
      { name: 'Fish sauce', measure: '3 tbsp' },
      { name: 'Lime juice', measure: '3 tbsp' },
      { name: 'Fresh coriander', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Thai Basil Chicken (Pad Krapow Gai)',
    category: 'Dinner',
    cuisine: 'Thai',
    prepMinutes: 10,
    cookMinutes: 8,
    instructions:
      'Pound the garlic and chilies in a mortar (or chop finely).\n\nHeat oil in a wok over high heat and fry the garlic-chili for 30 seconds.\n\nAdd the ground chicken, breaking it up, and stir-fry until cooked, 4 minutes.\n\nSeason with oyster sauce, fish sauce, soy sauce, and sugar; toss 1 minute.\n\nTurn off the heat and fold in the holy basil until wilted. Serve over rice, topped with a crispy fried egg.',
    ingredients: [
      { name: 'Ground chicken', measure: '400 g' },
      { name: 'Holy basil (or Thai basil)', measure: '2 cups' },
      { name: 'Garlic', measure: '4 cloves' },
      { name: "Bird's eye chilies", measure: '3' },
      { name: 'Oyster sauce', measure: '2 tbsp' },
      { name: 'Fish sauce', measure: '1 tbsp' },
      { name: 'Soy sauce', measure: '1 tbsp' },
      { name: 'Sugar', measure: '1 tsp' },
      { name: 'Eggs', measure: '2 (for frying)' },
      { name: 'Vegetable oil', measure: '2 tbsp' },
    ],
  },

  // ---------- Japanese ----------
  {
    name: 'Chicken Teriyaki',
    category: 'Dinner',
    cuisine: 'Japanese',
    prepMinutes: 10,
    cookMinutes: 15,
    instructions:
      'Mix soy sauce, mirin, sake, and sugar for the teriyaki sauce.\n\nPat the chicken thighs dry and sear skin-side down in a little oil until deeply golden, about 6 minutes. Flip and cook 4 minutes more.\n\nPour off excess fat, add the sauce, and simmer, turning the chicken, until the sauce reduces to a glossy glaze, 3-4 minutes.\n\nRest briefly, slice, and spoon over the glaze.\n\nServe with steamed rice, sesame seeds, and blanched greens.',
    ingredients: [
      { name: 'Chicken thighs (boneless, skin-on)', measure: '4' },
      { name: 'Soy sauce', measure: '4 tbsp' },
      { name: 'Mirin', measure: '4 tbsp' },
      { name: 'Sake', measure: '2 tbsp' },
      { name: 'Sugar', measure: '1 tbsp' },
      { name: 'Sesame seeds', measure: '1 tsp' },
      { name: 'Steamed rice', measure: 'to serve' },
    ],
  },
  {
    name: 'Salmon Rice Bowl (Sake Don)',
    category: 'Lunch',
    cuisine: 'Japanese',
    prepMinutes: 15,
    cookMinutes: 12,
    instructions:
      'Cook the sushi rice and season with rice vinegar, sugar, and salt while warm.\n\nBrush the salmon with soy and mirin and roast at 200°C for 10-12 minutes until just cooked; flake into large pieces.\n\nSlice the cucumber thinly and salt lightly; drain after 5 minutes.\n\nAssemble bowls: rice, salmon, cucumber, and avocado.\n\nTop with shredded nori, sesame seeds, pickled ginger, and a drizzle of soy.',
    ingredients: [
      { name: 'Salmon fillet', measure: '300 g' },
      { name: 'Sushi rice', measure: '250 g' },
      { name: 'Rice vinegar', measure: '2 tbsp' },
      { name: 'Soy sauce', measure: '2 tbsp' },
      { name: 'Mirin', measure: '1 tbsp' },
      { name: 'Cucumber', measure: '1/2' },
      { name: 'Avocado', measure: '1' },
      { name: 'Nori', measure: '1 sheet, shredded' },
      { name: 'Sesame seeds', measure: '1 tbsp' },
      { name: 'Pickled ginger', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Miso Soup with Tofu',
    category: 'Snack',
    cuisine: 'Japanese',
    prepMinutes: 5,
    cookMinutes: 10,
    instructions:
      'Soak the wakame in water for 5 minutes to rehydrate.\n\nBring the dashi to a bare simmer — do not boil.\n\nAdd the cubed tofu and wakame and warm through for 2 minutes.\n\nLadle a little hot dashi into a bowl, whisk in the miso until smooth, then return it to the pot off the heat.\n\nServe topped with sliced scallions.',
    ingredients: [
      { name: 'Dashi stock', measure: '800 ml' },
      { name: 'Miso paste', measure: '3 tbsp' },
      { name: 'Silken tofu', measure: '200 g, cubed' },
      { name: 'Dried wakame', measure: '1 tbsp' },
      { name: 'Scallions', measure: '2, sliced' },
    ],
  },
  {
    name: 'Chicken Katsu Curry',
    category: 'Dinner',
    cuisine: 'Japanese',
    prepMinutes: 20,
    cookMinutes: 25,
    instructions:
      'Soften the onion and carrot in oil for 5 minutes, add the curry roux cubes and water, and simmer, stirring, until thick, about 10 minutes.\n\nButterfly the chicken breasts, season, then coat in flour, beaten egg, and panko.\n\nShallow-fry in 1 cm of oil for 3-4 minutes per side until deep golden and cooked through. Drain on paper.\n\nSlice the katsu and serve over rice, ladled with curry sauce.\n\nAdd fukujinzuke pickles on the side if you have them.',
    ingredients: [
      { name: 'Chicken breasts', measure: '2' },
      { name: 'Panko breadcrumbs', measure: '100 g' },
      { name: 'Flour', measure: '50 g' },
      { name: 'Eggs', measure: '1, beaten' },
      { name: 'Japanese curry roux', measure: '4 cubes' },
      { name: 'Onion', measure: '1, sliced' },
      { name: 'Carrot', measure: '1, chunks' },
      { name: 'Water', measure: '500 ml' },
      { name: 'Steamed rice', measure: 'to serve' },
      { name: 'Vegetable oil', measure: 'for frying' },
    ],
  },

  // ---------- Italian ----------
  {
    name: 'Margherita Pizza',
    category: 'Dinner',
    cuisine: 'Italian',
    prepMinutes: 20,
    cookMinutes: 12,
    instructions:
      'Let the dough come to room temperature and preheat the oven (with a pizza stone or upturned tray) to its maximum, at least 250°C.\n\nCrush the tomatoes with salt and a little olive oil — no cooking needed.\n\nStretch the dough into a 30 cm round on floured parchment, leaving a border.\n\nSpread a thin layer of sauce, tear over the mozzarella, and slide onto the hot stone.\n\nBake 8-12 minutes until the crust is blistered. Finish with basil leaves, olive oil, and a pinch of salt.',
    ingredients: [
      { name: 'Pizza dough', measure: '300 g ball' },
      { name: 'Canned San Marzano tomatoes', measure: '200 g' },
      { name: 'Fresh mozzarella', measure: '125 g' },
      { name: 'Fresh basil', measure: '8 leaves' },
      { name: 'Olive oil', measure: '2 tbsp' },
      { name: 'Sea salt', measure: 'to taste' },
    ],
  },
  {
    name: 'Mushroom Risotto',
    category: 'Dinner',
    cuisine: 'Italian',
    prepMinutes: 10,
    cookMinutes: 30,
    instructions:
      'Keep the stock at a gentle simmer in a separate pan.\n\nSauté the mushrooms in half the butter until golden; set aside.\n\nSoften the shallot in olive oil, add the rice, and toast 2 minutes until the edges turn translucent. Splash in the wine and stir until absorbed.\n\nAdd hot stock a ladle at a time, stirring, letting each addition absorb before the next — about 18 minutes until the rice is al dente.\n\nFold in the mushrooms, remaining butter, and parmesan. Rest 2 minutes off the heat, loosen with a splash of stock, and serve.',
    ingredients: [
      { name: 'Arborio rice', measure: '300 g' },
      { name: 'Mixed mushrooms', measure: '300 g' },
      { name: 'Vegetable stock', measure: '1.2 litres' },
      { name: 'Shallot', measure: '1, finely chopped' },
      { name: 'White wine', measure: '100 ml' },
      { name: 'Butter', measure: '50 g' },
      { name: 'Parmesan', measure: '60 g, grated' },
      { name: 'Olive oil', measure: '2 tbsp' },
    ],
  },
  {
    name: 'Chicken Parmigiana',
    category: 'Dinner',
    cuisine: 'Italian',
    prepMinutes: 20,
    cookMinutes: 25,
    instructions:
      'Butterfly and flatten the chicken breasts to an even 1.5 cm.\n\nCoat in flour, then egg, then breadcrumbs mixed with half the parmesan.\n\nShallow-fry 3 minutes per side until golden; drain.\n\nTop each cutlet with marinara and mozzarella, then bake at 200°C for 12-15 minutes until bubbling.\n\nScatter with the remaining parmesan and basil. Serve with spaghetti or a green salad.',
    ingredients: [
      { name: 'Chicken breasts', measure: '2 large' },
      { name: 'Breadcrumbs', measure: '100 g' },
      { name: 'Flour', measure: '50 g' },
      { name: 'Eggs', measure: '2, beaten' },
      { name: 'Marinara sauce', measure: '250 ml' },
      { name: 'Mozzarella', measure: '125 g' },
      { name: 'Parmesan', measure: '50 g, grated' },
      { name: 'Fresh basil', measure: '6 leaves' },
      { name: 'Olive oil', measure: 'for frying' },
    ],
  },

  // ---------- Mediterranean / Middle Eastern ----------
  {
    name: 'Shakshuka',
    category: 'Breakfast',
    cuisine: 'Middle Eastern',
    prepMinutes: 10,
    cookMinutes: 20,
    instructions:
      'Soften the onion and pepper in olive oil over medium heat, about 6 minutes.\n\nAdd the garlic, cumin, paprika, and chili flakes and cook 1 minute.\n\nPour in the tomatoes, season, and simmer 8-10 minutes until thick enough to hold a spoon trail.\n\nMake wells and crack in the eggs. Cover and cook 5-7 minutes until the whites set but the yolks stay soft.\n\nScatter with feta and parsley and serve from the pan with crusty bread.',
    ingredients: [
      { name: 'Eggs', measure: '4' },
      { name: 'Canned tomatoes', measure: '400 g' },
      { name: 'Onion', measure: '1, sliced' },
      { name: 'Red bell pepper', measure: '1, sliced' },
      { name: 'Garlic', measure: '3 cloves' },
      { name: 'Ground cumin', measure: '1 tsp' },
      { name: 'Smoked paprika', measure: '1 tsp' },
      { name: 'Chili flakes', measure: '1/2 tsp' },
      { name: 'Feta', measure: '60 g' },
      { name: 'Parsley', measure: '2 tbsp' },
      { name: 'Olive oil', measure: '3 tbsp' },
    ],
  },
  {
    name: 'Falafel Wrap',
    category: 'Lunch',
    cuisine: 'Middle Eastern',
    prepMinutes: 20,
    cookMinutes: 10,
    instructions:
      'Blitz the soaked (not cooked) chickpeas with onion, garlic, herbs, cumin, coriander, and salt until coarse and packable; rest 15 minutes.\n\nForm into small patties with a spoonful of flour if loose.\n\nShallow-fry in hot oil 3 minutes per side until deep brown and crisp; drain.\n\nWhisk tahini with lemon juice, garlic, and water into a pourable sauce.\n\nWarm the flatbreads and fill with falafel, tomato, cucumber, pickles, and tahini sauce.',
    ingredients: [
      { name: 'Dried chickpeas (soaked overnight)', measure: '250 g' },
      { name: 'Onion', measure: '1/2' },
      { name: 'Garlic', measure: '3 cloves' },
      { name: 'Parsley and coriander', measure: '1 cup' },
      { name: 'Ground cumin', measure: '2 tsp' },
      { name: 'Ground coriander', measure: '1 tsp' },
      { name: 'Flatbreads', measure: '4' },
      { name: 'Tahini', measure: '3 tbsp' },
      { name: 'Lemon', measure: '1' },
      { name: 'Tomato and cucumber', measure: '1 cup, diced' },
      { name: 'Vegetable oil', measure: 'for frying' },
    ],
  },
  {
    name: 'Greek Chicken Souvlaki Bowls',
    category: 'Dinner',
    cuisine: 'Greek',
    prepMinutes: 20,
    cookMinutes: 15,
    instructions:
      'Marinate the chicken in olive oil, lemon juice, garlic, oregano, and salt for at least 15 minutes.\n\nGrate the cucumber, squeeze dry, and mix with yogurt, garlic, and dill for the tzatziki.\n\nThread the chicken onto skewers and grill or pan-fry over high heat until charred and cooked, 10-12 minutes.\n\nAssemble bowls with rice or warm pita, the chicken, tomatoes, red onion, olives, and feta.\n\nSpoon over the tzatziki and finish with oregano and lemon.',
    ingredients: [
      { name: 'Chicken thighs', measure: '500 g, cubed' },
      { name: 'Greek yogurt', measure: '200 g' },
      { name: 'Cucumber', measure: '1/2' },
      { name: 'Garlic', measure: '3 cloves' },
      { name: 'Dried oregano', measure: '2 tsp' },
      { name: 'Lemon', measure: '2' },
      { name: 'Cherry tomatoes', measure: '150 g' },
      { name: 'Red onion', measure: '1/2' },
      { name: 'Kalamata olives', measure: '60 g' },
      { name: 'Feta', measure: '80 g' },
      { name: 'Olive oil', measure: '4 tbsp' },
    ],
  },

  // ---------- Korean ----------
  {
    name: 'Beef Bulgogi',
    category: 'Dinner',
    cuisine: 'Korean',
    prepMinutes: 20,
    cookMinutes: 10,
    instructions:
      'Freeze the beef 30 minutes for easy slicing, then slice paper-thin against the grain.\n\nBlend soy sauce, pear, garlic, ginger, sugar, and sesame oil, and marinate the beef 15 minutes (or overnight).\n\nSear the beef in a screaming-hot pan in batches — don\'t crowd it — 2 minutes per batch.\n\nToss in the scallions for the last 30 seconds.\n\nServe with rice, sesame seeds, and lettuce leaves for wrapping.',
    ingredients: [
      { name: 'Ribeye or sirloin', measure: '500 g' },
      { name: 'Soy sauce', measure: '4 tbsp' },
      { name: 'Asian pear (or apple)', measure: '1/2, grated' },
      { name: 'Garlic', measure: '4 cloves' },
      { name: 'Ginger', measure: '1 tbsp' },
      { name: 'Brown sugar', measure: '1.5 tbsp' },
      { name: 'Sesame oil', measure: '1 tbsp' },
      { name: 'Scallions', measure: '4' },
      { name: 'Sesame seeds', measure: '1 tbsp' },
      { name: 'Lettuce leaves', measure: 'to serve' },
    ],
  },
  {
    name: 'Bibimbap',
    category: 'Lunch',
    cuisine: 'Korean',
    prepMinutes: 25,
    cookMinutes: 15,
    instructions:
      'Cook the rice. Season the beef with soy, garlic, and sesame oil, and stir-fry until browned.\n\nSauté each vegetable separately with a pinch of salt: spinach (then squeeze and season with sesame oil), carrots, mushrooms, and zucchini.\n\nFry the eggs sunny-side up.\n\nArrange the rice in bowls with the vegetables and beef in neat sections, egg on top.\n\nServe with gochujang thinned with a little sesame oil to stir through at the table.',
    ingredients: [
      { name: 'Short-grain rice', measure: '300 g' },
      { name: 'Ground beef', measure: '250 g' },
      { name: 'Spinach', measure: '150 g' },
      { name: 'Carrot', measure: '1, julienned' },
      { name: 'Shiitake mushrooms', measure: '100 g' },
      { name: 'Zucchini', measure: '1/2, julienned' },
      { name: 'Eggs', measure: '2' },
      { name: 'Gochujang', measure: '2 tbsp' },
      { name: 'Soy sauce', measure: '2 tbsp' },
      { name: 'Sesame oil', measure: '2 tbsp' },
      { name: 'Garlic', measure: '2 cloves' },
    ],
  },

  // ---------- French ----------
  {
    name: 'Ratatouille',
    category: 'Dinner',
    cuisine: 'French',
    prepMinutes: 20,
    cookMinutes: 40,
    instructions:
      'Dice the eggplant, zucchini, and peppers into even 2 cm pieces.\n\nSauté each vegetable separately in olive oil until lightly browned — this keeps them distinct — and set aside.\n\nIn the same pot, soften the onion, add garlic, then the tomatoes, thyme, and bay. Simmer 10 minutes.\n\nReturn all the vegetables and simmer gently, partly covered, for 20 minutes until tender but not collapsed.\n\nRest 10 minutes, stir in torn basil, and serve warm with crusty bread — even better the next day.',
    ingredients: [
      { name: 'Eggplant', measure: '1' },
      { name: 'Zucchini', measure: '2' },
      { name: 'Red bell peppers', measure: '2' },
      { name: 'Tomatoes', measure: '5, chopped' },
      { name: 'Onion', measure: '1' },
      { name: 'Garlic', measure: '4 cloves' },
      { name: 'Fresh thyme', measure: '4 sprigs' },
      { name: 'Bay leaf', measure: '1' },
      { name: 'Fresh basil', measure: '1 handful' },
      { name: 'Olive oil', measure: '6 tbsp' },
    ],
  },
  {
    name: 'Ham and Cheese Crêpes',
    category: 'Breakfast',
    cuisine: 'French',
    prepMinutes: 10,
    cookMinutes: 20,
    instructions:
      'Whisk the flour, eggs, milk, melted butter, and a pinch of salt into a thin, lump-free batter. Rest 15 minutes if you can.\n\nHeat a lightly buttered nonstick pan over medium-high heat. Pour in a small ladle of batter and swirl into a thin layer.\n\nCook about 1 minute until the edges lift, flip, and cook 30 seconds more.\n\nLay ham and grated cheese on each crêpe, fold into quarters, and return to the pan briefly to melt the cheese.\n\nServe hot with a green salad.',
    ingredients: [
      { name: 'Flour', measure: '125 g' },
      { name: 'Eggs', measure: '2' },
      { name: 'Milk', measure: '300 ml' },
      { name: 'Butter', measure: '30 g, melted' },
      { name: 'Ham', measure: '4 slices' },
      { name: 'Gruyère or Emmental', measure: '100 g, grated' },
    ],
  },

  // ---------- American ----------
  {
    name: 'Classic Turkey Burger',
    category: 'Dinner',
    cuisine: 'American',
    prepMinutes: 15,
    cookMinutes: 12,
    instructions:
      'Mix the ground turkey with grated onion, garlic powder, Worcestershire, salt, and pepper — handle lightly.\n\nShape into 4 patties slightly wider than the buns, with a dimple in the center.\n\nCook in an oiled skillet over medium-high heat, 5-6 minutes per side, to an internal temperature of 74°C. Top with cheese for the last minute.\n\nToast the buns cut-side down in the pan.\n\nBuild with lettuce, tomato, red onion, and your sauce of choice.',
    ingredients: [
      { name: 'Ground turkey', measure: '500 g' },
      { name: 'Burger buns', measure: '4' },
      { name: 'Onion', measure: '1/4, grated' },
      { name: 'Garlic powder', measure: '1 tsp' },
      { name: 'Worcestershire sauce', measure: '1 tbsp' },
      { name: 'Cheddar', measure: '4 slices' },
      { name: 'Lettuce, tomato, red onion', measure: 'for topping' },
    ],
  },
  {
    name: 'Buttermilk Pancakes',
    category: 'Breakfast',
    cuisine: 'American',
    prepMinutes: 10,
    cookMinutes: 15,
    instructions:
      'Whisk the flour, sugar, baking powder, baking soda, and salt in one bowl; the buttermilk, eggs, and melted butter in another.\n\nFold wet into dry until just combined — lumps are fine, overmixing makes them tough.\n\nHeat a buttered griddle over medium heat. Pour 1/4-cup rounds and cook until bubbles form and pop, about 2 minutes.\n\nFlip and cook 1-2 minutes more until golden.\n\nServe stacked with butter, maple syrup, and berries.',
    ingredients: [
      { name: 'Flour', measure: '250 g' },
      { name: 'Buttermilk', measure: '400 ml' },
      { name: 'Eggs', measure: '2' },
      { name: 'Butter', measure: '50 g, melted' },
      { name: 'Sugar', measure: '2 tbsp' },
      { name: 'Baking powder', measure: '2 tsp' },
      { name: 'Baking soda', measure: '1/2 tsp' },
      { name: 'Maple syrup', measure: 'to serve' },
      { name: 'Mixed berries', measure: 'to serve' },
    ],
  },

  // ---------- Vietnamese ----------
  {
    name: 'Chicken Pho',
    category: 'Dinner',
    cuisine: 'Vietnamese',
    prepMinutes: 15,
    cookMinutes: 45,
    instructions:
      'Char the halved onion and ginger in a dry pan until blackened in spots.\n\nSimmer the chicken with the charred aromatics, star anise, cinnamon, coriander seeds, and fish sauce in 2 litres of water for 40 minutes, skimming occasionally.\n\nRemove the chicken, shred the meat, and strain the broth. Season it with more fish sauce and a pinch of sugar to taste.\n\nCook the rice noodles per the packet and divide among bowls with the chicken.\n\nLadle over the hot broth and serve with bean sprouts, herbs, lime, and chili on the side.',
    ingredients: [
      { name: 'Chicken legs', measure: '600 g' },
      { name: 'Flat rice noodles', measure: '300 g' },
      { name: 'Onion', measure: '1, halved' },
      { name: 'Ginger', measure: '5 cm piece' },
      { name: 'Star anise', measure: '3' },
      { name: 'Cinnamon stick', measure: '1' },
      { name: 'Coriander seeds', measure: '1 tsp' },
      { name: 'Fish sauce', measure: '3 tbsp' },
      { name: 'Bean sprouts', measure: '150 g' },
      { name: 'Thai basil, coriander, lime, chili', measure: 'to serve' },
    ],
  },
  {
    name: 'Banh Mi Chicken Sandwich',
    category: 'Lunch',
    cuisine: 'Vietnamese',
    prepMinutes: 20,
    cookMinutes: 10,
    instructions:
      'Quick-pickle the carrot and daikon in vinegar, sugar, and salt for 15 minutes.\n\nMarinate the chicken in fish sauce, soy, garlic, sugar, and pepper for 10 minutes, then pan-fry until caramelized and cooked, about 8 minutes. Slice.\n\nSplit the baguettes and warm briefly. Spread generously with mayonnaise and a little pâté if using.\n\nLayer the chicken, drained pickles, cucumber spears, and jalapeño slices.\n\nStuff with a big handful of coriander and press gently before serving.',
    ingredients: [
      { name: 'Chicken thighs', measure: '400 g' },
      { name: 'Baguettes', measure: '2 small' },
      { name: 'Carrot', measure: '1, julienned' },
      { name: 'Daikon radish', measure: '100 g, julienned' },
      { name: 'Rice vinegar', measure: '4 tbsp' },
      { name: 'Sugar', measure: '2 tbsp' },
      { name: 'Fish sauce', measure: '2 tbsp' },
      { name: 'Soy sauce', measure: '1 tbsp' },
      { name: 'Mayonnaise', measure: '3 tbsp' },
      { name: 'Cucumber, jalapeño, coriander', measure: 'to fill' },
    ],
  },

  // ---------- Spanish ----------
  {
    name: 'Seafood Paella',
    category: 'Dinner',
    cuisine: 'Spanish',
    prepMinutes: 20,
    cookMinutes: 35,
    instructions:
      'Warm the stock with the saffron and keep it hot.\n\nIn a wide shallow pan, sauté the onion and garlic in olive oil, then add the tomato and paprika and cook down 5 minutes (the sofrito).\n\nStir in the rice to coat, then pour in the hot stock. Arrange everything evenly and do not stir again.\n\nSimmer 15 minutes, then nestle in the shrimp and mussels and cook 8-10 minutes more until the rice is tender and the mussels open.\n\nRest off the heat under foil for 5 minutes — prize the crisp socarrat from the base. Serve with lemon wedges.',
    ingredients: [
      { name: 'Bomba or paella rice', measure: '300 g' },
      { name: 'Shrimp', measure: '250 g' },
      { name: 'Mussels', measure: '400 g' },
      { name: 'Fish or chicken stock', measure: '900 ml' },
      { name: 'Saffron', measure: '1 pinch' },
      { name: 'Onion', measure: '1' },
      { name: 'Garlic', measure: '3 cloves' },
      { name: 'Tomato', measure: '2, grated' },
      { name: 'Smoked paprika', measure: '1.5 tsp' },
      { name: 'Olive oil', measure: '4 tbsp' },
      { name: 'Lemon', measure: '1' },
    ],
  },
];

async function main() {
  for (const [i, r] of DEMO_RECIPES.entries()) {
    const externalId = `demo-${i + 1}`;
    // TheMealDB import may already hold this dish under its real id; a demo
    // copy beside it shows up twice in search and splits taste signals.
    const taken = await prisma.recipe.findFirst({
      where: { nameLower: r.name.toLowerCase(), NOT: { externalId } },
      select: { id: true },
    });
    if (taken) continue;
    await prisma.recipe.upsert({
      where: { externalId },
      update: {},
      create: {
        externalId,
        name: r.name,
        nameLower: r.name.toLowerCase(),
        category: r.category,
        cuisine: r.cuisine,
        imageUrl: null,
        instructions: r.instructions,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        source: 'MEALDB',
        ingredients: {
          create: r.ingredients.map((ing, position) => ({ ...ing, position })),
        },
      },
    });
  }

  console.log(`Seeded ${DEMO_RECIPES.length} recipes (no demo users).`);

  // Best-effort per-serving nutrition for anything still missing it.
  const missing = await prisma.recipe.findMany({
    where: { calories: null },
    select: { id: true },
  });
  for (const r of missing) {
    try {
      await getOrComputeNutrition(r.id);
    } catch {
      // nutrition is best-effort; the backfill script can retry later
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
