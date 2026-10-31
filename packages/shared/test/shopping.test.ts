import { describe, it, expect } from 'vitest';
import { GROCERY_STORES, isPantryStaple, shoppingQuery } from '../src/index.js';

describe('shoppingQuery', () => {
  it('reduces an ingredient line to what is on the shelf', () => {
    expect(shoppingQuery('Paneer (cubed)')).toBe('paneer');
    expect(shoppingQuery('Coriander leaves, finely chopped')).toBe('coriander leaves');
    expect(shoppingQuery('Fresh ginger')).toBe('ginger');
    expect(shoppingQuery('Boiled potatoes')).toBe('potatoes');
    expect(shoppingQuery('Urad dal')).toBe('urad dal');
  });
});

describe('isPantryStaple', () => {
  it('pre-marks water, salt and dry spices only', () => {
    expect(isPantryStaple('Salt')).toBe(true);
    expect(isPantryStaple('Water')).toBe(true);
    expect(isPantryStaple('Turmeric')).toBe(true);
    expect(isPantryStaple('Mustard seeds')).toBe(true);
    expect(isPantryStaple('Paneer')).toBe(false);
    expect(isPantryStaple('Curry leaves')).toBe(false);
    expect(isPantryStaple('Onion')).toBe(false);
  });
});

describe('GROCERY_STORES', () => {
  it('builds an encoded https search URL per store', () => {
    const urls = Object.fromEntries(GROCERY_STORES.map((s) => [s.id, s.searchUrl('urad dal')]));
    expect(urls).toEqual({
      blinkit: 'https://blinkit.com/s/?q=urad%20dal',
      zepto: 'https://www.zeptonow.com/search?query=urad%20dal',
      instamart: 'https://www.swiggy.com/instamart/search?custom_back=true&query=urad%20dal',
    });
  });
});
