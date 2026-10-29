// Lowercase, accents gone, every run of anything but a letter or digit one
// space: the fold titles and names share.
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A title folded for matching (Ch 1.2, A4): lowercase, accents gone, every run
 * of anything but a letter or digit one space, and a leading "the", "a" or
 * "an" dropped when words follow it. "The Rage: Carrie 2" is `rage carrie 2`;
 * "carrie!" and "Carrie" are both `carrie`.
 */
export function normalizeTitle(title: string): string {
  return fold(title).replace(/^(the|a|an) (?=\S)/, "");
}

/**
 * An author's name folded for matching (Ch 1.3, A4): the title's fold without
 * the article rule, so "A. B. Guthrie" keeps its "a". Word order counts:
 * "King, Stephen" is not "Stephen King".
 */
export function normalizeName(name: string): string {
  return fold(name);
}
