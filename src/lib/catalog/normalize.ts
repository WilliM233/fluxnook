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

// A trailing "Vol. 4", "Vol 4" or "Volume 4", or a trailing "(Mirage)".
const SERIES_TAIL = /\s*(?:\bvol(?:ume)?\.?\s*[0-9]+|\([^()]*\))\s*$/i;

/**
 * A comic series' name folded for matching (Ch 1.4, A4): every trailing
 * volume number and parenthetical publisher stripped, as the hand-entered
 * labels carry both, then the title's fold without the article rule, so
 * "Tales of the Teenage Mutant Ninja Turtles Vol. 2" keeps its "the" and
 * "Teenage Mutant Ninja Turtles (Mirage) Vol. 1" is
 * `teenage mutant ninja turtles`.
 */
export function normalizeSeries(name: string): string {
  let text = name;
  while (SERIES_TAIL.test(text)) text = text.replace(SERIES_TAIL, "");
  return fold(text);
}

/**
 * A collected edition's title with its trailing number removed, folded
 * (Ch 1.4 Q1, L): "Ultimate Collection 1" is `ultimate collection`. A title
 * that was only a number folds to "", which matches nothing.
 */
export function collectedStem(title: string): string {
  return fold(title.replace(/\s*[0-9]+\s*$/, ""));
}
