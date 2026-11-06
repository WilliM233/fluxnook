import { formatsFor } from "./formats";

/**
 * The series tile's rules (Ch 1.7 A8), free of the database so a client can
 * run them on what A4 answered.
 */

type Floppy = {
  id: string;
  format: string;
  condition: string | null;
  note: string;
};

/**
 * The copy an untick lets go of. A4 answers oldest first per printing, and it
 * has no `createdAt`, so the last floppy in its answer is the newest.
 */
export function newestFloppy<Copy extends Floppy>(held: Copy[]): Copy | null {
  return held.filter((copy) => copy.format === "floppy").at(-1) ?? null;
}

/** Words on a copy turn the untick into a confirm; a date alone doesn't (A8). */
export function asksFirst(copy: Pick<Floppy, "condition" | "note">): boolean {
  return copy.condition !== null || copy.note !== "";
}

/** Whether a tile can take a floppy: a collected work on a collected run can't. */
export function takesFloppy(form: string | null): boolean {
  return formatsFor("comic", form).includes("floppy");
}
