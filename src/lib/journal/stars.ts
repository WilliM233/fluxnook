/**
 * Stars as the journal prints them (Ch 1.6 A9): "★ 4.5", "★ 5", a trailing
 * .0 dropped. A read's half steps and a shelf's tenths both print through it.
 */
export function starText(stars: number): string {
  const tenths = Math.round(stars * 10);
  const text =
    tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return `★ ${text}`;
}
