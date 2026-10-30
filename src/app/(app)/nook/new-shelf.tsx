"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FAILED = "Couldn't make the shelf just now. Try again.";

/** New shelf (A6): a name and a description, then the shelf's own page. */
export function NewShelf() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function begin() {
    setName("");
    setDescription("");
    setFields({});
    setError(null);
    setOpen(true);
  }

  async function make(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/shelves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 201 && body?.id) {
        router.push(`/shelves/${body.id}`);
        return;
      }
      setFields(body?.error?.fields ?? {});
      if (!body?.error?.fields) setError(body?.error?.message ?? FAILED);
    } catch {
      setError(FAILED);
    }
    setBusy(false);
  }

  return (
    <>
      <Button size="lg" onClick={begin}>
        New shelf
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
                New shelf
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                A list of works, flat or in sections. Only you can see it.
              </DialogDescription>
            </DialogHeader>

            <form noValidate onSubmit={make} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="shelf-name"
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="shelf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={fields.name ? true : undefined}
                  aria-describedby={
                    fields.name ? "shelf-name-error" : undefined
                  }
                  className="h-11 rounded-[10px] bg-background px-3"
                />
                {fields.name && (
                  <p
                    id="shelf-name-error"
                    className="text-[13px] text-destructive"
                  >
                    {fields.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="shelf-description"
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  Description
                </Label>
                <Textarea
                  id="shelf-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={fields.description ? true : undefined}
                  aria-describedby={
                    fields.description ? "shelf-description-error" : undefined
                  }
                  className="min-h-24 rounded-[10px] bg-background px-3"
                />
                {fields.description && (
                  <p
                    id="shelf-description-error"
                    className="text-[13px] text-destructive"
                  >
                    {fields.description}
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="lg" disabled={busy}>
                  Make shelf
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
