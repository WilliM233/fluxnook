import { redirect } from "next/navigation";
import { Footer } from "@/components/shell/footer";
import { Header } from "@/components/shell/header";
import { createClient } from "@/lib/supabase/server";

/**
 * Every signed-in page: one guard, the header and the TMDB footer. The
 * sign-in page at `/` sits outside the group and keeps its own layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header email={user.email} />
      {children}
      <Footer />
    </div>
  );
}
