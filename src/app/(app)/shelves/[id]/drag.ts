"use client";

import {
  type Announcements,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { dragSequence, moveInSequence, placeIn } from "@/lib/shelves/drop";
import { moveEntry } from "@/lib/shelves/order";
import type { ViewRow } from "./shelf-view";

export const MOVE_FAILED = "Couldn't move that. Try again.";

/** The keyboard sentence of the closing line, read when a grip is focused. */
export const KEYS =
  "The grip drags with a pointer or a finger; with a keyboard, focus it, press Space, move with the arrows, Space again to drop.";

type Section = { id: string; name: string; position: number };

/**
 * The grip's drag (A8): pointer, touch and keyboard sensors; a drop posts
 * the move, shows the rule's numbering at once (the function the server
 * runs), then the server's answer; a refusal puts every row back and says
 * so. One live region, dnd-kit's, says where the work went.
 */
export function useDragMove({
  shelfId,
  sections,
  rows,
  setRows,
  setAlert,
}: {
  shelfId: string;
  sections: Section[];
  rows: ViewRow[];
  setRows: (rows: ViewRow[]) => void;
  setAlert: (alert: string | null) => void;
}) {
  const [moving, setMoving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const sequence = dragSequence(sections, rows);

  const title = (id: UniqueIdentifier) =>
    rows.find((row) => row.id === id)?.item.title ?? "The work";
  const where = (section: string | null) =>
    section
      ? `to ${sections.find((s) => s.id === section)?.name}`
      : "above the first section";

  /** Where `activeId` lands if it is dropped on `overId`, numbered by the rule. */
  function landing(activeId: string, overId: string) {
    const place = placeIn(moveInSequence(sequence, activeId, overId), activeId);
    const placed = moveEntry(
      sections,
      rows.map(({ id, section, position }) => ({ id, section, position })),
      { id: activeId, ...place },
    );
    const number = placed.find((p) => p.id === activeId)?.position ?? 0;
    return { place, placed, number };
  }

  const numberOf = (id: UniqueIdentifier) =>
    rows.find((row) => row.id === id)?.position;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `${title(active.id)} picked up, number ${numberOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `${title(active.id)} is over no place.`;
      const { place, number } = landing(String(active.id), String(over.id));
      return `${title(active.id)} ${where(place.section)}, number ${number}.`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over || over.id === active.id) {
        return `${title(active.id)} stays at number ${numberOf(active.id)}.`;
      }
      const { place, number } = landing(String(active.id), String(over.id));
      return place.section
        ? `${title(active.id)} moved to ${sections.find((s) => s.id === place.section)?.name}, number ${number}`
        : `${title(active.id)} moved above the first section, number ${number}`;
    },
    onDragCancel: ({ active }) =>
      `${title(active.id)} back at number ${numberOf(active.id)}.`,
  };

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || over.id === active.id) return;
    const activeId = String(active.id);
    const { place, placed } = landing(activeId, String(over.id));
    const before = rows;
    const at = new Map(placed.map((p) => [p.id, p]));
    // The rule placed every row; null is a section too (above the first).
    const shown = (positions: Map<string, { position: number }>) =>
      rows
        .map((row) => {
          const placedAt = at.get(row.id);
          return {
            ...row,
            section: placedAt ? placedAt.section : row.section,
            position: positions.get(row.id)?.position ?? row.position,
          };
        })
        .sort((a, b) => a.position - b.position);

    setRows(shown(at));
    setMoving(true);
    try {
      const response = await fetch(
        `/api/v1/shelves/${shelfId}/entries/${activeId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(place),
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      const { positions }: { positions: { id: string; position: number }[] } =
        await response.json();
      setRows(shown(new Map(positions.map((p) => [p.id, p]))));
      setAlert(null);
    } catch {
      setRows(before);
      setAlert(MOVE_FAILED);
    } finally {
      setMoving(false);
    }
  }

  return {
    moving,
    sequence,
    context: {
      sensors,
      onDragEnd,
      accessibility: {
        announcements,
        screenReaderInstructions: { draggable: KEYS },
      },
    },
  };
}
