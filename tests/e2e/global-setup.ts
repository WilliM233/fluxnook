import { startComicVineStub } from "../stub/comicvine";
import { startOpenLibraryStub } from "../stub/openlibrary";
import { startTmdbStub } from "../stub/tmdb";
import { COMICVINE_STUB_PORT } from "./harness/comicvine-stub";
import { OPENLIBRARY_STUB_PORT } from "./harness/openlibrary-stub";
import { TMDB_STUB_PORT } from "./harness/tmdb-stub";

// The three provider stubs for the whole run, on the ports the app's
// webServer.env points at. Each is reused when one already answers (a local
// `npm run tmdb:stub`, `openlibrary:stub` or `comicvine:stub`). The returned
// function is Playwright's teardown.

const answers = (port: number) =>
  fetch(`http://127.0.0.1:${port}/health`).then(
    (response) => response.ok,
    () => false,
  );

export default async function globalSetup() {
  const closers: (() => Promise<void>)[] = [];
  if (!(await answers(TMDB_STUB_PORT))) {
    closers.push((await startTmdbStub({ port: TMDB_STUB_PORT })).close);
  }
  if (!(await answers(OPENLIBRARY_STUB_PORT))) {
    closers.push(
      (await startOpenLibraryStub({ port: OPENLIBRARY_STUB_PORT })).close,
    );
  }
  if (!(await answers(COMICVINE_STUB_PORT))) {
    closers.push(
      (await startComicVineStub({ port: COMICVINE_STUB_PORT })).close,
    );
  }
  return async () => {
    await Promise.all(closers.map((close) => close()));
  };
}
