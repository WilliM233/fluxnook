// Signed in by the (app) layout; the email and Sign out live in its header.
export default function NookPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 py-16">
      <h1 className="font-heading text-[34px] leading-tight">
        Your nook is empty
      </h1>
      <p className="text-muted-foreground">
        Shelves are on their way. For now, the nook is yours and it's quiet.
      </p>
    </main>
  );
}
