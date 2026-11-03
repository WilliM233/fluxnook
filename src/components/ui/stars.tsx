import { starText } from "@/lib/journal/stars";
import { cn } from "@/lib/utils";

// A five-point star on a 24 box, and its left half: the star is symmetric
// about x = 12, so the half is the outline's left side closed down the middle.
const STAR =
  "12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26";
const LEFT_HALF = "12,2 8.91,8.26 2,9.27 7,14.14 5.82,21.02 12,17.77";

export type StarFill = "full" | "half" | "empty";

/**
 * One star as the Deep Field design draws it (Ch 1.6): filled in accent,
 * outlined in line-strong when empty, the left half filled for a half.
 */
export function Star({
  fill,
  size = 16,
  className,
}: {
  fill: StarFill;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", className)}
      data-fill={fill}
    >
      <polygon
        points={STAR}
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={
          fill === "full"
            ? "fill-primary stroke-primary"
            : fill === "half"
              ? "fill-none stroke-primary"
              : "fill-none stroke-line-strong"
        }
      />
      {fill === "half" && (
        <polygon points={LEFT_HALF} className="fill-primary stroke-none" />
      )}
    </svg>
  );
}

/** Star k of five for a value in half steps. */
export function fillFor(stars: number | null, k: number): StarFill {
  if (stars === null) return "empty";
  if (stars >= k) return "full";
  return stars === k - 0.5 ? "half" : "empty";
}

/** Five stars at a value, read as one image: "★ 4.5", or "Unrated". */
export function Stars({
  stars,
  size,
  className,
}: {
  stars: number | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={stars === null ? "Unrated" : starText(stars)}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((k) => (
        <Star key={k} fill={fillFor(stars, k)} size={size} />
      ))}
    </span>
  );
}
