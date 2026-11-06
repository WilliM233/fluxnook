"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddToShelf } from "@/app/(app)/shelves/add-to-shelf";
import { Button } from "@/components/ui/button";
import type { ItemPage } from "@/lib/catalog/item-page";

/**
 * On your shelves (A10): each shelf holding the work as a link reading
 * "<shelf> · <section> · #<n>", and Add to shelf. The chip that follows an
 * add comes from the server's read, not from the sheet.
 */
export function ShelvesSection({
  item,
  shelves,
}: {
  item: { id: string; title: string };
  shelves: ItemPage["shelves"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const held = new Map(shelves.map((s) => [s.id, s.position]));

  return (
    <section
      aria-labelledby="shelves"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="shelves" className="font-heading text-[22px] font-semibold">
          On your shelves
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setOpen(true)}
        >
          Add to shelf
        </Button>
      </div>
      {shelves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not on a shelf yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {shelves.map((s) => (
            <li key={s.entry}>
              <Link
                href={`/shelves/${s.id}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-3.5 text-sm text-foreground hover:border-primary hover:text-accent-hover"
              >
                {[s.name, s.section].filter(Boolean).join(" · ")} ·{" "}
                <span className="text-dim">#{s.position}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <AddToShelf
          title={`Add ${item.title} to a shelf`}
          lede="It goes after what's already there, in the section you pick or outside the sections. A work sits on a shelf once."
          items={[item.id]}
          held={held}
          submit="Add to shelf"
          onAdded={() => {
            setOpen(false);
            router.refresh();
          }}
          onClose={(tried) => {
            setOpen(false);
            if (tried) router.refresh();
          }}
        />
      )}
    </section>
  );
}
