// Training calculations (requirements spec section 4.4–4.8).
// Pure functions without side effects so they can be unit tested.

/** Formats a number the German way without trailing zeros: 26.25 -> "26,25". */
export function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}
