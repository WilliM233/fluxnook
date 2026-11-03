import type { occurrenceStatuses } from "@/db/vocabulary";
import { type ItemType, words } from "@/lib/journal/words";

type Status = (typeof occurrenceStatuses)[number];

/**
 * Where it stands (Ch 1.6 A6): the shelf's status control's shape with the
 * journal's three words, Reading or Watching by the type. The current one
 * sits on the ground in the accent, as the shelf draws Done.
 */
export function WhereItStands({
  type,
  status,
  onPick,
}: {
  type: ItemType;
  status: Status;
  onPick: (status: Status) => void;
}) {
  return (
    <fieldset
      aria-label="Where it stands"
      className="m-0 flex min-w-0 overflow-hidden rounded-[10px] border border-line-strong p-0 text-sm"
    >
      {words(type).whereItStands.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={value === status}
          onClick={() => onPick(value)}
          className={`h-11 border-l border-line-strong px-4 outline-none first:border-l-0 focus-visible:ring-3 focus-visible:ring-ring/50 ${
            value === status
              ? "bg-background text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
