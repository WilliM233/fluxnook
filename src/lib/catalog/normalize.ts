/**
 * A title folded for matching (Ch 1.2, A4): lowercase, accents gone, every run
 * of anything but a letter or digit one space, and a leading "the", "a" or
 * "an" dropped when words follow it. "The Rage: Carrie 2" is `rage carrie 2`;
 * "carrie!" and "Carrie" are both `carrie`.
 */
export function normalizeTitle(title: string): string {
  const folded = title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return folded.replace(/^(the|a|an) (?=\S)/, "");
}
