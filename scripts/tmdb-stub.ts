// npm run tmdb:stub -- [--port 4010]
// The TMDB stub on a fixed port, for the Browse and a local dev server: point
// TMDB_BASE_URL at http://127.0.0.1:<port>/3 and TMDB_IMAGE_BASE_URL at
// http://127.0.0.1:<port>/t/p. Ctrl+C stops it. Exit 2 is a usage error.
import { parseArgs } from "node:util";
import { startTmdbStub } from "../tests/stub/tmdb";

let port: number;
try {
  const { values } = parseArgs({
    options: { port: { type: "string", default: "4010" } },
  });
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a port number, not ${values.port}`);
  }
} catch (error) {
  console.error(
    `tmdb:stub: ${(error as Error).message}\nusage: npm run tmdb:stub -- [--port 4010]`,
  );
  process.exit(2);
}

startTmdbStub({ port }).then(
  (stub) => {
    console.log(
      `tmdb:stub: listening; TMDB_BASE_URL=${stub.baseUrl} TMDB_IMAGE_BASE_URL=${stub.imageBaseUrl}`,
    );
  },
  (error) => {
    console.error(`tmdb:stub: ${(error as Error).message}`);
    process.exitCode = 1;
  },
);
