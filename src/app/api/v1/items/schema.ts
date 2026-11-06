import { z } from "zod";
import { bookForms, comicForms, seriesKinds } from "@/db/vocabulary";

// Request body of `POST /api/v1/items`: an item by hand, fields by type (A6).
// The manual form validates with this same schema in the browser, so the
// messages are written for the person filling it in.

const common = {
  title: z
    .string("Give it a title.")
    .trim()
    .min(1, "Give it a title.")
    .max(300, "Keep the title under 300 characters."),
  year: z
    .int("A year is a number.")
    .min(1000, "That year looks off.")
    .max(2999, "That year looks off.")
    .optional(),
  month: z
    .int("A month is a number.")
    .min(1, "Months run 1 to 12.")
    .max(12, "Months run 1 to 12.")
    .optional(),
  day: z
    .int("A day is a number.")
    .min(1, "Days run 1 to 31.")
    .max(31, "Days run 1 to 31.")
    .optional(),
  summary: z
    .string()
    .trim()
    .max(2000, "Keep the summary under 2000 characters.")
    .optional(),
};
const count = (what: string) =>
  z
    .int(`${what} is a whole number.`)
    .min(0, `${what} can't be negative.`)
    .optional();

export const manualItemSchema = z
  .discriminatedUnion(
    "type",
    [
      z.strictObject({
        type: z.literal("film"),
        ...common,
        runtimeMinutes: count("Runtime"),
      }),
      z.strictObject({
        type: z.literal("tv"),
        ...common,
        seasons: count("Seasons"),
        episodes: count("Episodes"),
      }),
      z.strictObject({
        type: z.literal("book"),
        ...common,
        form: z.enum(bookForms, "Pick a form."),
        author: z
          .string("Name the author.")
          .trim()
          .min(1, "Name the author.")
          .max(200, "Keep the author under 200 characters."),
      }),
      z.strictObject({
        type: z.literal("comic"),
        ...common,
        form: z.enum(comicForms, "Pick a form."),
        series: z
          .string()
          .trim()
          .min(1)
          .max(200, "Keep the series under 200 characters.")
          .optional(),
        seriesKind: z.enum(seriesKinds, "Pick a kind of series.").optional(),
        number: count("The number"),
      }),
    ],
    "Pick a type: film, TV, book or comic.",
  )
  // `when` runs these even while another field is wrong, so the form names
  // every problem at once; the input may be unparsed, hence the guards.
  .refine((item) => !(item?.month !== undefined && item?.year === undefined), {
    path: ["month"],
    message: "A month needs a year.",
    when: isObject,
  })
  .refine((item) => !(item?.day !== undefined && item?.month === undefined), {
    path: ["day"],
    message: "A day needs a month.",
    when: isObject,
  })
  .refine(
    ({ year, month, day }) =>
      ![year, month, day].every(Number.isInteger) ||
      new Date(
        Date.UTC(year as number, (month as number) - 1, day),
      ).getUTCMonth() ===
        (month as number) - 1,
    { path: ["day"], message: "That month has no such day." },
  );

function isObject({ value }: { value: unknown }) {
  return typeof value === "object" && value !== null;
}

export type ManualItem = z.infer<typeof manualItemSchema>;

/** The item's date at the precision the person gave it: 1979 alone is a year. */
export function releasedFrom(item: Pick<ManualItem, "year" | "month" | "day">) {
  if (item.year === undefined)
    return { releasedOn: null, releasedPrecision: null };
  const pad = (n: number) => String(n).padStart(2, "0");
  const precision =
    item.day !== undefined
      ? "day"
      : item.month !== undefined
        ? "month"
        : "year";
  return {
    releasedOn: `${item.year}-${pad(item.month ?? 1)}-${pad(item.day ?? 1)}`,
    releasedPrecision: precision as "day" | "month" | "year",
  };
}

export { fieldErrors } from "@/lib/api/fields";
