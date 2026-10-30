import { describe, it, expect } from 'vitest';
import { extractJson } from '../src/lib/json.js';

describe('extractJson', () => {
  it('parses a plain JSON object', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('extracts an object embedded in prose', () => {
    expect(extractJson('Sure! Here you go: {"a": {"b": 2}} hope that helps')).toEqual({
      a: { b: 2 },
    });
  });

  it('returns null on invalid JSON', () => {
    expect(extractJson('{not json}')).toBe(null);
    expect(extractJson('no braces at all')).toBe(null);
    expect(extractJson('')).toBe(null);
  });

  it('returns null when braces are inverted', () => {
    expect(extractJson('} ... {')).toBe(null);
  });
});
