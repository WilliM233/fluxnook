import { startTmdbStub } from "../stub/tmdb";
import { TMDB_STUB_PORT } from "./harness/tmdb-stub";

// The TMDB stub for the whole run, on the port the app's webServer.env points
// at. Reused when one already answers (a local `npm run tmdb:stub`). The
// returned function is Playwright's teardown.
export default async function globalSetup() {
  const health = await fetch(`http://127.0.0.1:${TMDB_STUB_PORT}/health`).then(
    (response) => response.ok,
    () => false,
  );
  if (health) return;
  const stub = await startTmdbStub({ port: TMDB_STUB_PORT });
  return () => stub.close();
}
