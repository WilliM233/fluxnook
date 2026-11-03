import { cn } from "cn";
import type * as React from "react";

// The pages' text buttons, as drawn: dim words that light on hover.
export const TEXT_BUTTON =
  "rounded text-[13px] text-dim outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** A dim text button (Edit, Delete, Not now): a plain button on those classes. */
function TextButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn(TEXT_BUTTON, className)} {...props} />
  );
}

export { TextButton };
