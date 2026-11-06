import { createClient } from "@supabase/supabase-js";
import { COVERS_BUCKET, coverPublicUrl } from "@/lib/cover-url";
import { readEnv, readServerEnv } from "@/lib/env";

export { COVERS_BUCKET, coverPublicUrl };

/**
 * Storage with the secret key, which RLS does not stop: the bucket has no
 * write policy, so this server-side client is the only writer. Never import
 * it from a client component.
 */
export function createCoverStore({
  supabaseUrl,
  secretKey,
}: {
  supabaseUrl: string;
  secretKey: string | null;
}) {
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Paste the value `npx supabase status` prints into .env.local.",
    );
  }
  const storage = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  return {
    async put(
      path: string,
      bytes: ArrayBuffer | Uint8Array,
      contentType: string,
    ) {
      const { error } = await storage
        .from(COVERS_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw error;
    },
    async remove(paths: string[]) {
      const { error } = await storage.from(COVERS_BUCKET).remove(paths);
      if (error) throw error;
    },
    publicUrl: (path: string) => coverPublicUrl(supabaseUrl, path),
    async listBuckets() {
      const { data, error } = await storage.listBuckets();
      if (error) throw error;
      return data;
    },
  };
}

export type CoverStore = ReturnType<typeof createCoverStore>;

/** The store a route uses: settings from the server's environment. */
export function coverStoreFromEnv(): CoverStore {
  return createCoverStore({
    supabaseUrl: readEnv().supabaseUrl,
    secretKey: readServerEnv().supabaseSecretKey,
  });
}

/** The store, or null with one log line: an import goes on without covers. */
export function coverStoreOrNull(): CoverStore | null {
  try {
    return coverStoreFromEnv();
  } catch (error) {
    console.warn(`import: covers off (${(error as Error).message})`);
    return null;
  }
}
