// Where the e2e run's Comic Vine stub listens; playwright.config.ts points
// the app at it and global-setup.ts starts it.
export const COMICVINE_STUB_PORT = 4012;
export const COMICVINE_STUB_ORIGIN = `http://127.0.0.1:${COMICVINE_STUB_PORT}`;
