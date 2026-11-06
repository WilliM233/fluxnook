import type { entryStatuses } from "@/db/vocabulary";

export type Status = (typeof entryStatuses)[number];

const STATUSES: [Status, string][] = [
  ["unmarked", "Unmarked"],
  ["done", "Done"],
  ["skipped", "Skipped"],
];

// The current segment sits on the ground; Done's word in the accent,
// Skipped's dim, as drawn.
const CURRENT: Record<Status, string> = {
  unmarked: "bg-background text-foreground",
  done: "bg-background text-primary",
  skipped: "bg-background text-dim",
};

/**
 * A row's status on this shelf (A9): three buttons in a group, the current
 * one pressed. The shelf's own flow; it writes no occurrence.
 */
export function StatusControl({
  title,
  status,
  busy,
  onPick,
}: {
  title: string;
  status: Status;
  busy: boolean;
  onPick: (status: Status) => void;
}) {
  return (
    <fieldset
      aria-label={`Status of ${title}`}
      aria-busy={busy || undefined}
      className="inline-flex flex-none overflow-hidden rounded-[10px] border border-line-strong text-[13px]"
    >
      {STATUSES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={value === status}
          disabled={busy}
          onClick={() => onPick(value)}
          className={`h-10 border-l border-line-strong px-3.5 outline-none first:border-l-0 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 ${
            value === status
              ? CURRENT[value]
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
