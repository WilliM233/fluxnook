"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShelfSheet } from "@/app/(app)/shelves/shelf-sheet";
import { Button } from "@/components/ui/button";

/** New shelf (A6): a name and a description, then the shelf's own page. */
export function NewShelf() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        New shelf
      </Button>
      {open && (
        <ShelfSheet
          title="New shelf"
          lede="A list of works, flat or in sections. Only you can see it."
          initial={{ name: "", description: "" }}
          submit="Make shelf"
          failed="Couldn't make the shelf just now. Try again."
          send={(words) =>
            fetch("/api/v1/shelves", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(words),
            })
          }
          onSaved={(body) => {
            const { id } = body as { id: string };
            router.push(`/shelves/${id}`);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
