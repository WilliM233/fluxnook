import { count } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { profiles } from "@/db/schema";

const { db, close } = createDb();

afterAll(() => close());

it("the runtime client reaches the local database through Drizzle", async () => {
  const [row] = await db.select({ n: count() }).from(profiles);
  expect(row.n).toBeGreaterThanOrEqual(0);
});

it("an empty DATABASE_URL is refused by name, before any connection", () => {
  expect(() => createDb("")).toThrow(/DATABASE_URL is not set/);
});
