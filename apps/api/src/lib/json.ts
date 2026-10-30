/**
 * Defensive extraction of a JSON object from an LLM response:
 * strip code fences, slice from the first `{` to the last `}`, then parse.
 * Returns null on any failure (caller treats that as a provider failure).
 */
export function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
