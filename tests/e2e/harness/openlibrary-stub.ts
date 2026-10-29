// Where the e2e run's Open Library stub listens; playwright.config.ts points
// the app at it and global-setup.ts starts it.
export const OPENLIBRARY_STUB_PORT = 4011;
export const OPENLIBRARY_STUB_ORIGIN = `http://127.0.0.1:${OPENLIBRARY_STUB_PORT}`;
