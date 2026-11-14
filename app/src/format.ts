// Date helpers (yyyy-MM-dd strings) and German display formats, used by all views and calculations.

export const DAY_MS = 86_400_000;

/** Local date as yyyy-MM-dd. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Calendar arithmetic on yyyy-MM-dd strings (computed in UTC, so no daylight saving shifts). */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/** yyyy-MM-dd as a local Date (midnight), for weekday and display. */
export function localDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Freitag, 13. Nov. 2026" */
export function formatLongDate(iso: string): string {
  return localDate(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Fr., 13.11." */
export function formatShortDate(iso: string): string {
  return localDate(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** "November 2026" */
export function formatMonth(iso: string): string {
  return localDate(iso.slice(0, 8) + '01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/** "2026-11-12" -> "12.11.2026" */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Weekday of a yyyy-MM-dd date: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return localDate(iso).getDay();
}
