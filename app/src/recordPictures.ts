// Pictures shown with a new e1RM record (requirements spec section 11).
// Every image in assets/record-pictures is picked up automatically; one is chosen at random.

const urls = Object.values(
  import.meta.glob<string>('./assets/record-pictures/*.{webp,png}', { eager: true, query: '?url', import: 'default' }),
);

export function randomRecordPicture(): string | undefined {
  if (!urls.length) return undefined;
  return urls[Math.floor(Math.random() * urls.length)];
}
