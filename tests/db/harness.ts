import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { createDb } from "@/db/client";
import { loadFixtures } from "@/fixtures/load";
import { RESET_COMICVINE } from "../reset-comicvine";

// Shared by the Ch 1.2 db tests: a fresh account with the fixtures loaded,
// and the lookups they all make. The older files keep their own copies.

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  }
  return value;
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false } },
);

/** A new account, through GoTrue so its profiles row exists. */
export async function signUp(sql: postgres.Sql) {
  const email = `db-${crypto.randomUUID()}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  const [{ id }] = await sql`select id from auth.users where email = ${email}`;
  return { email, id: id as string };
}

/** A new account holding the fixtures' shelves; the catalog upserts. */
export async function signUpWithFixtures(sql: postgres.Sql) {
  const user = await signUp(sql);
  const { db, close } = createDb();
  try {
    await loadFixtures(db, { email: user.email, log: () => {} });
  } finally {
    await close();
  }
  return user;
}

/** The item a fixture source key names, e.g. `letterboxd`/`20ZQ`. */
export async function itemFor(sql: postgres.Sql, source: string, key: string) {
  const [row] = await sql`
    select item from item_sources where source = ${source} and key = ${key}`;
  if (!row) throw new Error(`no item for ${source}:${key}`);
  return row.item as string;
}

/** The Browse's three imports undone on the fixture rows (Ch 1.4.2). */
export async function resetComicVine(sql: postgres.Sql) {
  for (const statement of RESET_COMICVINE) await sql.unsafe(statement);
}
