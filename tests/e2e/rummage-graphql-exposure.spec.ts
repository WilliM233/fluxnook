import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Rummage R7 (Raccoon S6). Taking `public` off [api] schemas closes REST, not
// GraphQL: pg_graphql (on by default for hosted projects, off locally) serves
// any table anon can read. This turns pg_graphql on in the local database,
// asks for profiles with the browser's key, and turns it off again if it was
// off before. Needs the local stack (`npx supabase start`).
const db = (sql: string) =>
  execFileSync(
    "docker",
    ["exec", "supabase_db_fluxnook", "psql", "-U", "postgres", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();

const envFile = existsSync(".env.local") ? ".env.local" : ".env.example";
const publishableKey =
  readFileSync(envFile, "utf8").match(
    /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)$/m,
  )?.[1] ?? "";

let graphqlWasOn = false;

test.beforeAll(() => {
  graphqlWasOn =
    db("select count(*) from pg_extension where extname = 'pg_graphql'") ===
    "1";
  db("create extension if not exists pg_graphql");
});

test.afterAll(() => {
  if (!graphqlWasOn) db("drop extension if exists pg_graphql");
});

test("the publishable key can't reach profiles through GraphQL", async ({
  request,
}) => {
  const response = await request.post("http://127.0.0.1:54321/graphql/v1", {
    headers: { apikey: publishableKey },
    data: {
      query: "{ profilesCollection(first: 1) { edges { node { id } } } }",
    },
  });
  const body = await response.json();
  expect(body.data?.profilesCollection).toBeUndefined();
});
