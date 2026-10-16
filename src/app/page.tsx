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

  const { code, error } = await searchParams;

  // A link whose callback URL isn't allow-listed falls back to site_url and
  // lands here with its code. Hand it to the callback, which signs the person
  // in or sends them back with the link-didn't-work line.
  if (typeof code === "string" && code !== "") {
    redirect(`/api/v1/auth/callback?code=${encodeURIComponent(code)}`);
  }

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
