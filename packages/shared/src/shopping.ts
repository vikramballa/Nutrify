// ---------------------------------------------------------------------------
// Grocery → quick-commerce hand-off. None of Blinkit, Zepto or Instamart has
// a public cart API, so the app opens the store's search for one item. The
// URLs are the stores' own https search pages: iOS hands them to the store's
// app when it is installed (universal links — Zepto and Swiggy's
// apple-app-site-association files claim these paths), else Safari opens the
// website.
// ---------------------------------------------------------------------------

export type GroceryStoreId = 'blinkit' | 'zepto' | 'instamart';

export interface GroceryStore {
  id: GroceryStoreId;
  name: string;
  /** Brand colour for the picker swatch, and the text that reads on it. */
  color: string;
  ink: string;
  searchUrl: (query: string) => string;
}

const q = encodeURIComponent;

export const GROCERY_STORES: readonly GroceryStore[] = [
  { id: 'blinkit', name: 'Blinkit', color: '#F8CB46', ink: '#1F1F1F', searchUrl: (s) => `https://blinkit.com/s/?q=${q(s)}` },
  { id: 'zepto', name: 'Zepto', color: '#5A1E8C', ink: '#FFFFFF', searchUrl: (s) => `https://www.zeptonow.com/search?query=${q(s)}` },
  {
    id: 'instamart',
    name: 'Instamart',
    color: '#FC8019',
    ink: '#FFFFFF',
    searchUrl: (s) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${q(s)}`,
  },
];

// Words that describe preparation, not the product on the shelf.
const PREP =
  /\b(fresh(ly)?|chopped|finely|roughly|thinly|diced|sliced|minced|grated|crushed|ground|boiled|soaked|mashed|peeled|deseeded|cubed|halved|beaten|melted|softened|torn|shredded|julienned|large|small|medium|ripe|optional|to taste|for garnish(ing)?|for frying|as needed|a few|few|some|whole)\b/gi;

/** "Paneer (cubed)", "Coriander leaves, finely chopped" → "paneer", "coriander leaves". */
export function shoppingQuery(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[,;]/)[0]
    .replace(PREP, ' ')
    .replace(/^[\d\s/.½¼¾-]+/, ' ')
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || name.trim().toLowerCase();
}

// Shelf staples nearly every kitchen has: pre-marked "have" so the check
// starts on the ingredients that matter. The user can still flip any of them.
const STAPLE =
  /^(water|hot water|cold water|warm water|ice|ice cubes|salt|black salt|rock salt|turmeric|turmeric powder|haldi|red chilli powder|chilli powder|chili powder|kashmiri chilli powder|cumin|cumin seeds|jeera|cumin powder|coriander powder|dhaniya powder|mustard seeds|rai|asafoetida|hing|garam masala|black pepper|pepper|fenugreek seeds|methi seeds|sugar)$/;

export function isPantryStaple(name: string): boolean {
  return STAPLE.test(shoppingQuery(name));
}
