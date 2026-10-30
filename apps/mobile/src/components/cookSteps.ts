// Splitting instructions into steps. Sources disagree on format: seeded
// recipes use blank lines, TheMealDB embeds "1.\t" markers in one long blob,
// and some rows are a single paragraph. Pure functions so the rules are tested.

/** Drop a leading "3." / "3)" / "Step 3:" so the UI badge isn't doubled up. */
function stripMarker(step: string): string {
  return step.replace(/^\s*(?:step\s*)?\d{1,2}\s*[.):]\s*/i, '').trim();
}

/**
 * Split on sequential numbering only. Requiring each marker to be the next
 * expected number avoids cutting on prose digits — "1.5 cups", `2"-wide`, or
 * "about 5 minutes" never look like step 2.
 */
function splitOnNumbers(text: string): string[] {
  const marker = /(\d{1,2})\s*[.)]\s+/g;
  const cuts: number[] = [];
  let expected = 1;
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    if (Number(m[1]) !== expected) continue;
    // A decimal ("1.5") has a digit straight after the dot, which \s+ already
    // rejects; this guards against a digit immediately before the marker.
    if (m.index > 0 && /\d/.test(text[m.index - 1])) continue;
    cuts.push(m.index);
    expected++;
  }
  if (cuts.length < 2) return [];

  return cuts
    .map((start, i) => text.slice(start, cuts[i + 1] ?? text.length))
    .map(stripMarker)
    .filter(Boolean);
}

export function splitSteps(instructions: string): string[] {
  const text = instructions.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  // 1. Blank-line paragraphs (seeded recipes).
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map(stripMarker)
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  // 2. Embedded sequential numbering (TheMealDB).
  const numbered = splitOnNumbers(text);
  if (numbered.length > 1) return numbered;

  // 3. One step per line, when the lines are long enough to be real steps.
  const lines = text
    .split('\n')
    .map(stripMarker)
    .filter((l) => l.length > 0);
  if (lines.length > 1 && lines.every((l) => l.length > 12)) return lines;

  // 4. A single paragraph stays one step — better than inventing bad cuts.
  return [stripMarker(text)];
}
