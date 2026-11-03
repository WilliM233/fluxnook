"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { fillFor, Star } from "@/components/ui/stars";
import { TEXT_BUTTON } from "@/components/ui/text-button";
import { halfFor, stepStars } from "@/lib/journal/stars";
import { cn } from "@/lib/utils";

const STEP: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

/**
 * Stars as a control (Ch 1.6 A6, A5's card): five 44×44 buttons, the left
 * half of a star its half, the arrow keys a half step. On a sheet the number
 * sits beside it with Clear; on a card it is the stars alone.
 *
 * A busy control still takes input and says so with `aria-busy`: its
 * buttons stay enabled, so the focused star keeps focus while a change saves,
 * and the caller decides what a change made meanwhile does (the card queues
 * it, 1.6.2 Rummage R5).
 */
export function StarControl({
  value,
  onChange,
  label,
  clear = false,
  busy = false,
  compact = false,
  className,
}: {
  value: number | null;
  onChange: (stars: number | null) => void;
  label: string;
  clear?: boolean;
  busy?: boolean;
  /** A card's stars, set tight as drawn: 18px in 24×32 targets, not 30 in 44×44. */
  compact?: boolean;
  className?: string;
}) {
  function pick(stars: number | null) {
    if (stars !== value) onChange(stars);
  }

  function click(k: number, event: MouseEvent<HTMLButtonElement>) {
    // A keyboard's Enter or Space is a click with no pointer: the whole star.
    if (event.detail === 0) return pick(k);
    const box = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < box.left + box.width / 2 ? "left" : "right";
    pick(halfFor(k, side));
  }

  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const by = STEP[event.key];
    if (!by) return;
    event.preventDefault();
    pick(stepStars(value, by));
  }

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <fieldset
        aria-label={label}
        aria-busy={busy || undefined}
        className="m-0 inline-flex min-w-0 items-center border-0 p-0"
      >
        {[1, 2, 3, 4, 5].map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === 1 ? "1 star" : `${k} stars`}
            aria-pressed={value !== null && value >= k}
            onClick={(event) => click(k, event)}
            onKeyDown={key}
            className={cn(
              "inline-flex items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              compact ? "h-8 w-6" : "size-11",
            )}
          >
            <Star fill={fillFor(value, k)} size={compact ? 18 : 30} />
          </button>
        ))}
      </fieldset>
      {clear && (
        <>
          <span
            data-testid="stars-value"
            className="min-w-[2ch] text-base tabular-nums"
          >
            {value ?? ""}
          </span>
          {value !== null && (
            <button
              type="button"
              className={TEXT_BUTTON}
              onClick={() => pick(null)}
            >
              Clear
            </button>
          )}
        </>
      )}
    </div>
  );
}
