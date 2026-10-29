const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A date at the precision it's known to: 16 November 1976; May 1984; 1979.
 * Its own module, free of the database, so a client component can use it.
 */
export function releasedLabel(
  date: string | null,
  precision: string | null,
): string | null {
  if (!date || !precision) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (precision === "year") return String(year);
  if (precision === "month") return `${MONTHS[month - 1]} ${year}`;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
