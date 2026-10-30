// Markdown-lite parser for assistant replies. Pure functions, no React —
// so the chat formatting can be unit-tested without a renderer.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  /** A quantity like "320 kcal" or "24g" — rendered as a highlight chip. */
  | { kind: 'stat'; text: string };

export type Block =
  | { kind: 'heading'; spans: Inline[] }
  | { kind: 'paragraph'; spans: Inline[] }
  | { kind: 'bullet'; spans: Inline[] }
  | { kind: 'numbered'; index: number; spans: Inline[] };

const UNITS = 'kcal|cals?|calories|kj|g|mg|kg|ml|l|oz|lbs?|%|min(?:s|utes)?|hrs?|hours?';
// Bold first, then code, then bare quantities — first alternative wins per position.
const INLINE_RE = new RegExp(
  String.raw`\*\*([^*]+)\*\*|` + '`([^`]+)`|' + String.raw`(\d+(?:[.,]\d+)?\s?(?:${UNITS})\b)`,
  'gi',
);

export function parseInline(line: string): Inline[] {
  const spans: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(line); m; m = INLINE_RE.exec(line)) {
    if (m.index > last) spans.push({ kind: 'text', text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ kind: 'bold', text: m[1] });
    else if (m[2] !== undefined) spans.push({ kind: 'code', text: m[2] });
    else spans.push({ kind: 'stat', text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ kind: 'text', text: line.slice(last) });
  return spans;
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', spans: parseInline(heading[1]) });
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push({
        kind: 'numbered',
        index: Number(numbered[1]),
        spans: parseInline(numbered[2]),
      });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ kind: 'bullet', spans: parseInline(bullet[1]) });
      continue;
    }
    // A short line that is entirely bold reads as a section title, not a sentence.
    const wholeBold = /^\*\*([^*]+)\*\*:?$/.exec(line);
    if (wholeBold) {
      blocks.push({ kind: 'heading', spans: [{ kind: 'text', text: wholeBold[1] }] });
      continue;
    }
    blocks.push({ kind: 'paragraph', spans: parseInline(line) });
  }
  return blocks;
}
