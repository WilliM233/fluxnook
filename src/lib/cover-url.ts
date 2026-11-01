// A cover's address, free of the storage client, so a client component can
// print one (the shelf page's rows, Ch 1.5.2). `covers.ts` re-exports both.

/** The one bucket covers live in; public, written only by the server. */
export const COVERS_BUCKET = "covers";

/** A cover's public URL from its bucket-relative path. Needs no key. */
export function coverPublicUrl(supabaseUrl: string, path: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${COVERS_BUCKET}/${path}`;
}
