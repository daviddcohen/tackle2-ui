/**
 * The path the app is served under, read from the document's `<base href>`
 * (rendered from `BASE_PATH` at build time, `/` by default). Always starts and
 * ends with a slash, for example `/` or `/tackle2-ui/`.
 */
export const getBasePath = (): string => new URL(document.baseURI).pathname;

/**
 * The base path in the form react-router's `basename` expects: no trailing
 * slash, so the default base `/` gives `""` (the router's own default).
 */
export const getRouterBasename = (): string => getBasePath().replace(/\/$/, "");

/** Resolve an app-relative path (no leading slash) against the base path. */
export const withBasePath = (relativePath: string): string =>
  new URL(relativePath, document.baseURI).pathname;
