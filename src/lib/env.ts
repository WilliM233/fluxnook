import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

type EnvSource = Partial<Record<keyof z.infer<typeof envSchema>, string>>;

export type Env = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

// Literal property reads, so Next can inline NEXT_PUBLIC_* values wherever this runs.
const processEnv: EnvSource = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

/**
 * Reads the Supabase settings, throwing with the variable's name when one is
 * missing, so a clone without `.env.local` fails saying what to set.
 */
export function readEnv(source: EnvSource = processEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(
      `Missing or invalid environment variable: ${names.join(", ")}. Copy .env.example to .env.local.`,
    );
  }
  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

const serverEnvSchema = z.object({
  TMDB_API_KEY: z.string().optional(),
  TMDB_BASE_URL: z.url().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE_URL: z.url().default("https://image.tmdb.org/t/p"),
  SUPABASE_SECRET_KEY: z.string().optional(),
  OPENLIBRARY_BASE_URL: z.url().default("https://openlibrary.org"),
  OPENLIBRARY_COVERS_BASE_URL: z
    .url()
    .default("https://covers.openlibrary.org"),
  OPENLIBRARY_CONTACT: z.string().optional(),
});

type ServerEnvSource = Partial<
  Record<keyof z.infer<typeof serverEnvSchema>, string>
>;

export type ServerEnv = {
  tmdbApiKey: string | null;
  tmdbBaseUrl: string;
  tmdbImageBaseUrl: string;
  supabaseSecretKey: string | null;
  openLibraryBaseUrl: string;
  openLibraryCoversBaseUrl: string;
  openLibraryContact: string | null;
};

// Server-only secrets: never NEXT_PUBLIC_, so Next never inlines them into a
// bundle. Read lazily, so a route reads the environment it runs in.
const processServerEnv = (): ServerEnvSource => ({
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL,
  TMDB_IMAGE_BASE_URL: process.env.TMDB_IMAGE_BASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  OPENLIBRARY_BASE_URL: process.env.OPENLIBRARY_BASE_URL,
  OPENLIBRARY_COVERS_BASE_URL: process.env.OPENLIBRARY_COVERS_BASE_URL,
  OPENLIBRARY_CONTACT: process.env.OPENLIBRARY_CONTACT,
});

/**
 * Reads the server-only settings. Every one is optional: an empty key reads as
 * null (the feature it unlocks is off), and the provider URLs default to the
 * providers' own, so only tests and the Browse's stub ever set them.
 */
export function readServerEnv(
  source: ServerEnvSource = processServerEnv(),
): ServerEnv {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value),
  );
  const result = serverEnvSchema.safeParse(present);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid environment variable: ${names.join(", ")}.`);
  }
  return {
    tmdbApiKey: result.data.TMDB_API_KEY ?? null,
    tmdbBaseUrl: result.data.TMDB_BASE_URL,
    tmdbImageBaseUrl: result.data.TMDB_IMAGE_BASE_URL,
    supabaseSecretKey: result.data.SUPABASE_SECRET_KEY ?? null,
    openLibraryBaseUrl: result.data.OPENLIBRARY_BASE_URL,
    openLibraryCoversBaseUrl: result.data.OPENLIBRARY_COVERS_BASE_URL,
    openLibraryContact: result.data.OPENLIBRARY_CONTACT ?? null,
  };
}
