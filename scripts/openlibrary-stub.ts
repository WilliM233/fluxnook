// npm run openlibrary:stub -- [--port 4011]
// The Open Library stub on a fixed port, for the Browse and a local dev
// server: point OPENLIBRARY_BASE_URL and OPENLIBRARY_COVERS_BASE_URL at
// http://127.0.0.1:<port>. Ctrl+C stops it. Exit 2 is a usage error.
import { parseArgs } from "node:util";
import { startOpenLibraryStub } from "../tests/stub/openlibrary";

let port: number;
try {
  const { values } = parseArgs({
    options: { port: { type: "string", default: "4011" } },
  });
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a port number, not ${values.port}`);
  }
} catch (error) {
  console.error(
    `openlibrary:stub: ${(error as Error).message}\nusage: npm run openlibrary:stub -- [--port 4011]`,
  );
  process.exit(2);
}

startOpenLibraryStub({ port }).then(
  (stub) => {
    console.log(
      `openlibrary:stub: listening; OPENLIBRARY_BASE_URL=${stub.baseUrl} OPENLIBRARY_COVERS_BASE_URL=${stub.coversBaseUrl}`,
    );
  },
  (error) => {
    console.error(`openlibrary:stub: ${(error as Error).message}`);
    process.exitCode = 1;
  },
);
