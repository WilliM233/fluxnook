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

/**
 * The star control's arrow keys (A6): a half step up or down from the value,
 * 0.5 to 5. Unrated stays unrated going down; Clear is the only way to none.
 */
export function stepStars(value: number | null, by: 1 | -1): number | null {
  if (value === null) return by === 1 ? 0.5 : null;
  return Math.min(5, Math.max(0.5, value + 0.5 * by));
}

/** Star k's value under a click: its left half is the half (A6). */
export function halfFor(k: number, side: "left" | "right"): number {
  return side === "left" ? k - 0.5 : k;
}
