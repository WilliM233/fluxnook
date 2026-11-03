/** A refused save as a sheet shows it: errors under fields, or one line. */
export type Refusal = { fields: Record<string, string>; line: string | null };

export const NONE: Refusal = { fields: {}, line: null };

/**
 * The route's `{ error: { message, fields? } }` split for a sheet: a field
 * the sheet draws gets its error under it; any other, or none, is the
 * sheet's own line, so a 409 is that line and no special case.
 */
export async function refusalOf(
  response: Response,
  drawn: string[],
  failed: string,
): Promise<Refusal> {
  const body = await response.json().catch(() => null);
  const all: Record<string, string> = body?.error?.fields ?? {};
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const [name, message] of Object.entries(all)) {
    if (drawn.includes(name)) fields[name] = message;
    else rest.push(message);
  }
  const line =
    rest.length > 0
      ? rest.join(" ")
      : Object.keys(fields).length > 0
        ? null
        : (body?.error?.message ?? failed);
  return { fields, line };
}
