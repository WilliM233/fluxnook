import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";

// Rummage R10 (ch 0.3). profiles.id references auth.users with on delete
// cascade (Ch 0.2), so deleting an account leaves no profile behind. Nothing
// tested it until the db harness existed.

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

it("deleting an auth user deletes its profiles row", async () => {
  const email = `db-${crypto.randomUUID()}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  expect(error).toBeNull();

  const [user] = await sql`select id from auth.users where email = ${email}`;
  expect(
    await sql`select id from public.profiles where id = ${user.id}`,
  ).toHaveLength(1);

  await sql`delete from auth.users where id = ${user.id}`;

  expect(
    await sql`select id from public.profiles where id = ${user.id}`,
  ).toHaveLength(0);
});
