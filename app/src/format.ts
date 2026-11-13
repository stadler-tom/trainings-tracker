// Display helpers for German formatting.

/** "2026-11-12" -> "12.11.2026" */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Weekday of a yyyy-MM-dd date: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}
