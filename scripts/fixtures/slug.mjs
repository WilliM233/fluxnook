/**
 * The key half of every `manual:` id, one rule for every builder.
 *
 * Accents and apostrophes go first, so Été is ete and Salem's Lot is
 * salems-lot, not t and salem-s-lot. Anything else that isn't a letter or a
 * digit, a bullet included, becomes one hyphen.
 */
export function slug(text) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
