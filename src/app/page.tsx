import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Nothing on the sign-in form is useful to someone already signed in.
  if (user) {
    redirect("/nook");
  }

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Fluxnook</h1>
        <p className="text-muted-foreground">
          A cozy corner for everything you watch, read and play.
        </p>
      </div>
      <SignInForm linkError={error === "link"} />
    </main>
  );
}
