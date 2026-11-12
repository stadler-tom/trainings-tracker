// Display helpers for German formatting.

/** "2026-11-12" -> "12.11.2026" */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
