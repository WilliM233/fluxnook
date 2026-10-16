"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiErrorBody } from "@/lib/api/errors";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "failed"; message: string };

const fallbackMessage = "Couldn't send a link just now. Try again in a moment.";

export function SignInForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    try {
      const response = await fetch("/api/v1/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setStatus({ kind: "sent", email });
        return;
      }
      const body = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      setStatus({
        kind: "failed",
        message: body?.error.message ?? fallbackMessage,
      });
    } catch {
      setStatus({ kind: "failed", message: fallbackMessage });
    }
  }

  if (status.kind === "sent") {
    return (
      <p role="status">
        Check your inbox at {status.email}. The link signs you in on this
        browser.
      </p>
    );
  }

  return (
    <form onSubmit={sendLink} className="flex flex-col gap-4">
      {linkError && (
        <p role="alert" className="text-sm text-destructive">
          That link didn't work. It may have expired or been used already. Send
          yourself a new one.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={status.kind === "sending"}>
        Send me a link
      </Button>
      {status.kind === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
    </form>
  );
}
