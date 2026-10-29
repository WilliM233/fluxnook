// npm run comicvine:stub -- [--port 4012] [--dir <recordings>]
// The Comic Vine stub on a fixed port, for the Browse and a local dev server:
// point COMICVINE_BASE_URL at http://127.0.0.1:<port>/api (and set
// COMICVINE_API_KEY to anything). `--dir` serves a copy of the recordings
// instead of tests/fixtures/comicvine, so a Browse red can tweak one without
// touching the committed files. Ctrl+C stops it. Exit 2 is a usage error.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { startComicVineStub } from "../tests/stub/comicvine";

const usage =
  "usage: npm run comicvine:stub -- [--port 4012] [--dir <recordings>]";

let port: number;
let dir: string | undefined;
try {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "4012" },
      dir: { type: "string" },
    },
  });
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a port number, not ${values.port}`);
  }
  dir = values.dir ? resolve(values.dir) : undefined;
} catch (error) {
  console.error(`comicvine:stub: ${(error as Error).message}\n${usage}`);
  process.exit(2);
}

startComicVineStub({ port, dir }).then(
  (stub) => {
    console.log(
      `comicvine:stub: listening; COMICVINE_BASE_URL=${stub.baseUrl}${dir ? ` (recordings from ${dir})` : ""}`,
    );
  },
  (error) => {
    console.error(`comicvine:stub: ${(error as Error).message}`);
    process.exitCode = 1;
  },
);
