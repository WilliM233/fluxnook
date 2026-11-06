// Where the e2e run's TMDB stub listens; playwright.config.ts points the app
// at it and global-setup.ts starts it.
export const TMDB_STUB_PORT = 4010;
export const TMDB_STUB_ORIGIN = `http://127.0.0.1:${TMDB_STUB_PORT}`;
