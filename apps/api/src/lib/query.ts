/** A positive integer query param, clamped to [1, max]; junk reads as `fallback`. */
export function intParam(raw: string | undefined, fallback: number, max: number): number {
  return Math.min(Math.max(parseInt(raw ?? '', 10) || fallback, 1), max);
}
