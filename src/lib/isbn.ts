/**
 * The check digit an ISBN-13 ends with, from its first twelve digits:
 * weights 1 and 3 alternating, and the digit that brings the sum to a ten.
 */
export function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** Whether ten characters are an ISBN-10 whose check digit holds (X is 10). */
export function isValidIsbn10(isbn10: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(isbn10)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = isbn10[i] === "X" ? 10 : Number(isbn10[i]);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

/** An ISBN-10 as its 13: the 978 prefix, its first nine digits, a new check. */
export function isbn10to13(isbn10: string): string {
  const first12 = `978${isbn10.slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
}

/**
 * The ISBN-13 that text names, or null (Ch 1.3, A3). Hyphens and spaces go;
 * what's left is ten characters (a trailing X allowed) or thirteen digits under
 * 978 or 979, and the check digit must hold. A 10 comes back as its 13. Open
 * Library resolves junk numbers to junk books, so this check is the only thing
 * between a typo and the wrong edition.
 */
export function normalizeIsbn(text: string): string | null {
  const compact = text.replace(/[\s-]+/g, "").toUpperCase();
  if (compact.length === 10) {
    return isValidIsbn10(compact) ? isbn10to13(compact) : null;
  }
  if (/^97[89][0-9]{10}$/.test(compact)) {
    return isbn13CheckDigit(compact) === compact[12] ? compact : null;
  }
  return null;
}
