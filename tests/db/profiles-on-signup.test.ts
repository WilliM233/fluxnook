import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  }
  return value;
}

const sql = postgres(required("DATABASE_URL"), { max: 1 });
const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false } },
);

afterAll(() => sql.end());

// Keyed on a fresh address, so it holds on any database state without a reset.
it("signing up creates exactly one profiles row with the auth user's id", async () => {
  const email = `db-${crypto.randomUUID()}@example.com`;

  const { error } = await supabase.auth.signInWithOtp({ email });
  expect(error).toBeNull();

  const users = await sql`select id from auth.users where email = ${email}`;
  expect(users).toHaveLength(1);

  const profiles =
    await sql`select id from public.profiles where id = ${users[0].id}`;
  expect(profiles).toHaveLength(1);
});
