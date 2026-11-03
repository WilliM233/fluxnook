// The box's today, as the sheet and the page see it: local parts, never
// `new Date().toISOString().slice(0, 10)`, which is tomorrow after 18:00 in
// Chicago (L, 1.6.1 sign-off).

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

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-03": what a date field reads. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "3 November 2026": what a card prints. */
export function localLong(now = new Date()): string {
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/** "2026-11-03T21:14": what a date-and-time field reads. */
export function localNow(now = new Date()): string {
  return `${localToday(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
