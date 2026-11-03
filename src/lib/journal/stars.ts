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
 * A shelf's or a section's star (A9, census C2): the mean over the works that
 * have stars, to one decimal, rounded half up on the exact mean. In integers,
 * since stars are half steps: S the stars doubled and summed, n how many, the
 * tenths are floor((10·S + n) / 2n). `toFixed` reads 4.35 as 4.3; this is 4.4.
 */
export function meanStars(values: readonly number[]): number | null {
  const n = values.length;
  if (n === 0) return null;
  const doubled = values.reduce((sum, stars) => sum + Math.round(stars * 2), 0);
  return Math.floor((10 * doubled + n) / (2 * n)) / 10;
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
