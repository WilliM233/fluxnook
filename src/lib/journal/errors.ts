// A3's date rules, said once for the schemas and the lib.
export const FINISHED_BEFORE = "Finished can't be before Started.";
export const STILL_GOING = "Still going, so no Finished date yet.";

/** A journal rule a route answers as a 400 at one field (Ch 1.6 A3, A4). */
export class RuleError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Whether the error is the one-open-read index refusing a second Reading.
 * Drizzle wraps the driver's error, so the cause chain is walked.
 */
export function isOpenTwice(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as Error).cause) {
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === "23505" && pg.constraint_name === "occurrences_one_open") {
      return true;
    }
  }
  return false;
}
