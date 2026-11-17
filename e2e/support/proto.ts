/**
 * Prototype switcher state (persona, scenario, stage) lives in the URL as
 * `protoPersona`, `protoScenario` and `protoStage`. Every spec builds its URLs
 * through `protoUrl` so a test never depends on the switcher defaults.
 *
 * MSW keeps mock state in the page: a full `page.goto` resets it. Tests that
 * mutate data and then check another page must navigate in-app (click links,
 * or `spaNavigate`).
 */
import type { Page } from "@playwright/test";

export type Persona =
  | "platformEngineer"
  | "enterpriseArchitect"
  | "hubMigrator";

export type Scenario =
  | "initial"
  | "partialConfiguration"
  | "configured"
  | "preflightBlocked"
  | "queued"
  | "running"
  | "actionRequired"
  | "failed"
  | "completed"
  | "loading"
  | "apiError";

/** Scenarios offered by the switcher, in switcher order. */
export const SCENARIOS_BY_PERSONA: Record<Persona, Scenario[]> = {
  platformEngineer: [
    "initial",
    "partialConfiguration",
    "configured",
    "failed",
    "loading",
    "apiError",
  ],
  enterpriseArchitect: [
    "initial",
    "partialConfiguration",
    "configured",
    "preflightBlocked",
    "queued",
    "running",
    "actionRequired",
    "failed",
    "completed",
    "loading",
    "apiError",
  ],
  hubMigrator: [
    "configured",
    "running",
    "actionRequired",
    "failed",
    "completed",
  ],
};

export const PERSONAS = Object.keys(SCENARIOS_BY_PERSONA) as Persona[];

export const PERSONA_LABEL: Record<Persona, string> = {
  platformEngineer: "Platform Engineer (Admin)",
  enterpriseArchitect: "Enterprise Architect (Architect)",
  hubMigrator: "Hub Migrator (Migrator)",
};

/** Page a persona lands on after a persona change or reset. */
export const PERSONA_START: Record<Persona, string> = {
  platformEngineer: "/models",
  enterpriseArchitect: "/applications",
  hubMigrator: "/applications",
};

export interface ProtoState {
  /** Defaults to `enterpriseArchitect`. */
  persona?: Persona;
  /** Defaults to `configured`. */
  scenario?: Scenario;
  stage?: number;
  /** Extra query parameters (table state, `tab`, legacy `from`, ...). */
  params?: Record<string, string>;
}

// Only used to parse relative paths; page.goto resolves against baseURL.
const PARSE_ORIGIN = "http://e2e.invalid";

/**
 * `path` (may carry its own query and hash) with explicit prototype state.
 * Returned without its leading slash so `page.goto` resolves it against the
 * base URL, which may carry a base path (`/tackle2-ui/`).
 */
export const protoUrl = (path: string, state: ProtoState = {}) => {
  const url = new URL(path, PARSE_ORIGIN);
  url.searchParams.set("protoPersona", state.persona ?? "enterpriseArchitect");
  url.searchParams.set("protoScenario", state.scenario ?? "configured");
  if (state.stage != null) url.searchParams.set("protoStage", `${state.stage}`);
  for (const [key, value] of Object.entries(state.params ?? {}))
    url.searchParams.set(key, value);
  return `${url.pathname.slice(1)}${url.search}${url.hash}`;
};

export const gotoProto = (page: Page, path: string, state: ProtoState = {}) =>
  page.goto(protoUrl(path, state));

/**
 * Client-side navigation that keeps the in-page MSW state (a `page.goto`
 * would reload and reset it). Keeps the current prototype query. `path` is a
 * router path (`/agents`), resolved under the document's base path.
 */
export const spaNavigate = (page: Page, path: string) =>
  page.evaluate((target) => {
    // Without a <base> element, baseURI is the current page, not the root.
    const base = document.querySelector("base[href]")
      ? document.baseURI
      : `${window.location.origin}/`;
    const url = new URL(target.replace(/^\//, ""), base);
    for (const [key, value] of new URLSearchParams(window.location.search))
      if (key.startsWith("proto") && !url.searchParams.has(key))
        url.searchParams.set(key, value);
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);

export const searchParam = (page: Page, key: string) =>
  new URL(page.url()).searchParams.get(key);
