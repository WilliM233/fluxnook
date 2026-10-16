"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/v1/auth/sign-out", { method: "POST" });
    if (response.ok) {
      window.location.assign("/");
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={signOut} disabled={pending}>
        Sign out
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't sign you out. Try again.
        </p>
      )}
    </div>
  );
}
