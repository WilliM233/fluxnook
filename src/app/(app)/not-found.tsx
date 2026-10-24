import Link from "next/link";

/** A missing page inside the signed-in shell, so the header stays put. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-6 py-16">
      <h1 className="font-heading text-[34px] leading-tight">
        Nothing on this shelf
      </h1>
      <p className="text-muted-foreground">
        That page isn't in the nook.{" "}
        <Link href="/nook" className="text-primary hover:text-accent-hover">
          Back to your nook
        </Link>
        .
      </p>
    </main>
  );
}
