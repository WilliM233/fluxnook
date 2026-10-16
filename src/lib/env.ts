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
