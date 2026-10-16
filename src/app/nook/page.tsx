import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function NookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <p className="text-sm text-muted-foreground">{user.email}</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Your nook is empty</h1>
        <p className="text-muted-foreground">
          Shelves are on their way. For now, the nook is yours and it's quiet.
        </p>
      </div>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
