import Link from "next/link";
import { ManualForm } from "./manual-form";

/** `/items/new`: an item by hand, for the things no provider knows (A9). */
export default function NewItemPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-11">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[34px] leading-tight tracking-tight">
          Add an item by hand
        </h1>
        <p className="text-sm text-muted-foreground">
          For the things no provider knows. If it's a film or a show,{" "}
          <Link href="/search" className="text-primary hover:text-accent-hover">
            search first
          </Link>
          ; providers do the typing and bring the poster.
        </p>
      </div>
      <ManualForm />
    </main>
  );
}
