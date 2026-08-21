/** MOCK=1 serves fixture data so the UI can be built on a Tuesday in July. */
export function isMock(): boolean {
  const v = process.env.MOCK;
  return v === '1' || v === 'true';
}
