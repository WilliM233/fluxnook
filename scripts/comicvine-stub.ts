// npm run comicvine:stub -- [--port 4012]
// The Comic Vine stub on a fixed port, for the Browse and a local dev server:
// point COMICVINE_BASE_URL at http://127.0.0.1:<port>/api (and set
// COMICVINE_API_KEY to anything). Ctrl+C stops it. Exit 2 is a usage error.
import { parseArgs } from "node:util";
import { startComicVineStub } from "../tests/stub/comicvine";

let port: number;
try {
  const { values } = parseArgs({
    options: { port: { type: "string", default: "4012" } },
  });
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a port number, not ${values.port}`);
  }
} catch (error) {
  console.error(
    `comicvine:stub: ${(error as Error).message}\nusage: npm run comicvine:stub -- [--port 4012]`,
  );
  process.exit(2);
}

startComicVineStub({ port }).then(
  (stub) => {
    console.log(
      `comicvine:stub: listening; COMICVINE_BASE_URL=${stub.baseUrl}`,
    );
  },
  (error) => {
    console.error(`comicvine:stub: ${(error as Error).message}`);
    process.exitCode = 1;
  },
);
