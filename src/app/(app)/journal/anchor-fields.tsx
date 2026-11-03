import { selectClass } from "@/app/(app)/search/isbn-card";
import { Input } from "@/components/ui/input";
import { anchorKindLabel } from "@/lib/journal/anchor";
import type { Pin } from "@/lib/journal/forms";
import {
  type AnchorKind,
  anchorKindsFor,
  type ItemType,
} from "@/lib/journal/words";

/**
 * "Where in it" (Ch 1.6 A6, A7): a select of the kinds the work takes and
 * the place typed, "or leave it". Absent for a film, which takes none.
 */
export function AnchorFields({
  id,
  type,
  form,
  pin,
  onPin,
  errors,
}: {
  id: string;
  type: ItemType;
  form: string | null;
  pin: Pin;
  onPin: (pin: Pin) => void;
  errors: { anchorKind?: string; anchorValue?: string };
}) {
  const kinds = anchorKindsFor(type, form);
  if (kinds.length === 0) return null;
  const error = errors.anchorKind ?? errors.anchorValue;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor={`${id}-kind`} className="text-sm text-muted-foreground">
          Where in it
        </label>
        <select
          id={`${id}-kind`}
          value={pin.anchorKind}
          onChange={(e) =>
            onPin({ ...pin, anchorKind: e.target.value as AnchorKind })
          }
          className={`${selectClass} w-36`}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {anchorKindLabel(kind)}
            </option>
          ))}
        </select>
        <Input
          aria-label="Where in it, the place"
          value={pin.anchorValue}
          onChange={(e) => onPin({ ...pin, anchorValue: e.target.value })}
          placeholder={type === "tv" ? "e.g. S02E03" : "e.g. 112"}
          maxLength={40}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 w-32 rounded-[10px] bg-background px-3"
        />
        <span className="text-sm text-dim">or leave it</span>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
