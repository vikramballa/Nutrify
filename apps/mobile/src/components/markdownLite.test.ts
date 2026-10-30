import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './markdownLite';

describe('parseInline', () => {
  it('splits bold, code and quantity spans', () => {
    expect(parseInline('Eat **eggs** with `salt` for 24g protein')).toEqual([
      { kind: 'text', text: 'Eat ' },
      { kind: 'bold', text: 'eggs' },
      { kind: 'text', text: ' with ' },
      { kind: 'code', text: 'salt' },
      { kind: 'text', text: ' for ' },
      { kind: 'stat', text: '24g' },
      { kind: 'text', text: ' protein' },
    ]);
  });

  it('does not treat a bare number as a quantity', () => {
    expect(parseInline('serves 4 people')).toEqual([{ kind: 'text', text: 'serves 4 people' }]);
  });

  it('is reusable across calls (no sticky regex leak)', () => {
    const first = parseInline('320 kcal');
    expect(parseInline('320 kcal')).toEqual(first);
  });
});

describe('parseBlocks', () => {
  it('recognises headings, bullets and numbered steps', () => {
    const blocks = parseBlocks('## Macros\n- 30g protein\n\n1. Boil water\n**Tip:**\nplain line');
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'bullet',
      'numbered',
      'heading',
      'paragraph',
    ]);
    expect(blocks[2]).toMatchObject({ kind: 'numbered', index: 1 });
  });
});
