import Link from "next/link";
import { SignOutButton } from "@/app/(app)/nook/sign-out-button";

/** The signed-in header: wordmark, the two places to go, who you are. */
export function Header({ email }: { email: string | undefined }) {
  return (
    <header className="flex flex-wrap items-center gap-6 border-b px-4 py-4 sm:px-10">
      <Link
        href="/nook"
        className="font-heading text-[26px] font-semibold tracking-tight text-foreground"
      >
        fluxnook
      </Link>
      <nav aria-label="Primary" className="flex gap-5 text-sm font-medium">
        <Link
          href="/search"
          className="text-muted-foreground hover:text-foreground"
        >
          Search
        </Link>
        <Link
          href="/nook"
          className="text-muted-foreground hover:text-foreground"
        >
          Nook
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-4 text-[13px] text-muted-foreground">
        <span>{email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
