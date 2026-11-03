import type { occurrenceStatuses } from "@/db/vocabulary";
import type { AnchorKind } from "./words";

/**
 * The journal's sheets as data (Ch 1.6 A6, A7): the fields a person fills,
 * the route bodies they become, and the box's today and now. Pure and free
 * of the database, so the sheets and the tests share it.
 */

type Status = (typeof occurrenceStatuses)[number];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Today on this box as "YYYY-MM-DD", from local parts: never
 * `toISOString().slice(0, 10)`, which is tomorrow after 18:00 in Chicago.
 */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Now as a `datetime-local` value, "YYYY-MM-DDTHH:MM", local parts. */
export function localNow(now = new Date()): string {
  return `${localToday(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** A `datetime-local` value as the ISO instant the route takes, or null. */
export function isoFromLocal(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** A stored instant ("…03.512345Z") as the `datetime-local` value it shows. */
export function localFromIso(iso: string): string {
  return localNow(new Date(iso));
}

/** "Where in it": a kind from the type's list and the place typed. */
export type Pin = { anchorKind: AnchorKind | ""; anchorValue: string };

/** The anchor keys for a pin, or none: the select alone pins nothing. */
function pinned({ anchorKind, anchorValue }: Pin) {
  const value = anchorValue.trim();
  return anchorKind && value ? { anchorKind, anchorValue: value } : null;
}

/** The Log and Edit sheets' fields; an empty date field is "". */
export type ReadForm = {
  status: Status;
  startedOn: string;
  finishedOn: string;
  stars: number | null;
};

/** The four read keys, every one sent: null is the field left empty. */
function readKeys(form: ReadForm) {
  return {
    status: form.status,
    startedOn: form.startedOn || null,
    // A read still going has no Finished, whatever the field remembers.
    finishedOn: form.status === "in_progress" ? null : form.finishedOn || null,
    stars: form.stars,
  };
}

/**
 * `POST /api/v1/occurrences` from the Log sheet (A3): the read, and a first
 * entry when the textarea holds something or a place is typed. A place with
 * no words goes too, so the route says "Write something." instead of the
 * place being dropped in silence (1.6.2 Rummage R4).
 */
export function readPost(
  item: string,
  form: ReadForm,
  entry: Pin & { body: string },
) {
  const pin = pinned(entry);
  return {
    item,
    ...readKeys(form),
    ...(entry.body.trim() || pin
      ? { entry: { body: entry.body, ...pin } }
      : {}),
  };
}

/** `PATCH /api/v1/occurrences/<id>` from Edit this read: the four keys whole. */
export function readChange(form: ReadForm) {
  return readKeys(form);
}

/** The entry sheet's fields; `writtenAt` a `datetime-local` value. */
export type EntryForm = Pin & { body: string; writtenAt: string };

/**
 * An edit's time only when the person moved it from where the sheet opened
 * it: a `datetime-local` holds minutes, and an untouched edit would lose the
 * entry's seconds.
 */
function movedTime(form: EntryForm, opened: string) {
  const at = form.writtenAt === opened ? null : isoFromLocal(form.writtenAt);
  return at ? { writtenAt: at } : null;
}

/**
 * An add's time is what Written shows (1.6.2 Rummage R6). When it shows
 * this minute, it is now to the millisecond, so an entry added in the same
 * minute as another still sorts after it.
 */
function shownTime(form: EntryForm, now: Date) {
  const at =
    form.writtenAt === localNow(now)
      ? now.toISOString()
      : isoFromLocal(form.writtenAt);
  return at ? { writtenAt: at } : null;
}

/** `POST /api/v1/occurrences/<id>/entries` from Add an entry (A4). */
export function entryPost(form: EntryForm, now = new Date()) {
  return {
    body: form.body,
    ...pinned(form),
    ...shownTime(form, now),
  };
}

/** `PATCH …/entries/<eid>` from Edit entry: the pair whole, null to clear. */
export function entryChange(form: EntryForm, opened: string) {
  return {
    body: form.body,
    ...(pinned(form) ?? { anchorKind: null, anchorValue: null }),
    ...movedTime(form, opened),
  };
}
