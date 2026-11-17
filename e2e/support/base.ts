/**
 * The app may be served under a base path (GitHub Pages serves the prototype
 * at `/tackle2-ui/`). `playwright.config.cjs` normalizes the base URL to end
 * with `/`; specs navigate with relative paths (`protoUrl`) and compare app
 * paths through these helpers, so the same spec runs at `/` and under a base.
 */

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PW_BASE ??
  "http://localhost:9000";

/** Base path of the app under test, with a leading and trailing slash. */
export const BASE_PATH = new URL(
  baseURL.endsWith("/") ? baseURL : `${baseURL}/`
).pathname;

/** `/plan-runs/1` under the base, as rendered in hrefs (`/tackle2-ui/plan-runs/1`). */
export const withBase = (path: string) =>
  `${BASE_PATH.slice(0, -1)}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * Router path of a browser pathname: strips the base (`/tackle2-ui/x` to `/x`).
 * A pathname outside the base gets a prefix no router path has, so a URL that
 * escaped the base never matches an expected app path.
 */
export const appPath = (pathname: string) =>
  pathname.startsWith(BASE_PATH)
    ? `/${pathname.slice(BASE_PATH.length)}`
    : `<outside base>${pathname}`;

/** `url` with its pathname replaced by the router path. */
export const appUrl = (url: string | URL) => {
  const parsed = new URL(url);
  parsed.pathname = appPath(parsed.pathname);
  return parsed;
};
