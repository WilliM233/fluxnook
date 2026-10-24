// npm run fixtures:load -- --user <email> [--replace]
// Loads every fixture under supabase/seed/fixtures into the tables for one
// local user (src/fixtures/load.ts). Exit 1 is a refusal, exit 2 a usage error.
import { parseArgs } from "node:util";
import { createDb } from "../src/db/client";
import { LoadError, loadFixtures } from "../src/fixtures/load";

const usage =
  "usage: npm run fixtures:load -- --user <email> [--replace]\n" +
  "  --user     the local account the shelves, copies and occurrences belong to\n" +
  "  --replace  clear that account's shelves, copies and occurrences first";

let values: { user?: string; replace?: boolean };
try {
  ({ values } = parseArgs({
    options: {
      user: { type: "string" },
      replace: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  console.error(`fixtures:load: ${(error as Error).message}\n${usage}`);
  process.exit(2);
}

if (!values.user) {
  console.error(`fixtures:load: --user is required\n${usage}`);
  process.exit(2);
}

async function main(email: string, replace: boolean) {
  const { db, close } = createDb();
  try {
    await loadFixtures(db, { email, replace });
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    console.error(`fixtures:load: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

main(values.user, values.replace ?? false).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
