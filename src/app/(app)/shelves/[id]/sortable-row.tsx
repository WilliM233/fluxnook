"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { ShelfRow as Row } from "@/lib/shelves/shelf-page";
import { ShelfRow } from "./shelf-row";

/**
 * Where a sortable sits while the drag runs. Only the vertical part of the
 * transform: a row stays in its lane, as the list does.
 */
function lane(
  transform: { y: number } | null,
  transition: string | undefined,
  dragging: boolean,
): CSSProperties {
  return {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    position: "relative",
    zIndex: dragging ? 10 : undefined,
  };
}

/**
 * A row the grip moves (A8): a 44×44 button named "Reorder <title>", the one
 * thing on the row that starts a drag, with a pointer, a finger or the keys.
 */
export function SortableRow({
  row,
  supabaseUrl,
  aside,
  disabled,
}: {
  row: Row;
  supabaseUrl: string;
  aside: ReactNode;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled });
  return (
    <ShelfRow
      ref={setNodeRef}
      style={lane(transform, transition, isDragging)}
      dragging={isDragging}
      row={row}
      supabaseUrl={supabaseUrl}
      aside={aside}
      grip={
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${row.item.title}`}
          className={`inline-flex size-11 flex-none cursor-grab touch-none items-center justify-center rounded-[10px] border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
            isDragging
              ? "border-primary text-primary"
              : "border-transparent text-dim hover:text-foreground"
          }`}
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
      }
    />
  );
}

/**
 * A section's heading as a place in the drag (A8): it moves aside as rows
 * pass it, and a work dropped on it lands in that section, so an empty
 * section takes a drop. It has no grip; a heading isn't dragged.
 */
export function SortableHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={lane(transform, transition, false)}
      className="flex flex-wrap items-baseline gap-2.5"
    >
      {children}
    </div>
  );
}
