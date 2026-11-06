/**
 * A dim line whose star ("★ 4.5") is in accent, as the shelf's line and a
 * Journal row's state are drawn. The text is `text` unchanged, so a test
 * reads it whole; a `star` it doesn't hold prints the line plain.
 */
export function AccentStar({
  text,
  star,
}: {
  text: string;
  star: string | null;
}) {
  const at = star === null ? -1 : text.lastIndexOf(star);
  if (star === null || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-primary">{star}</span>
      {text.slice(at + star.length)}
    </>
  );
}
