# Agentic prototype end-to-end suite (Playwright)

Regression suite for the agentic migration prototype running against the
MSW-mocked backend (`MOCK=stub`). Upstream's own end-to-end suite is Cypress
(`cypress/`); this suite covers the prototype's pages and flows only.

## Running

```bash
npm run test:e2e:prototype            # whole suite, starts its own dev server
npm run test:e2e:prototype -- e2e/config-plane          # one folder
npm run test:e2e:prototype -- -g "plan wizard"          # by title
npm run test:e2e:prototype -- --ui                      # Playwright UI mode
npm run test:e2e:prototype:typecheck                    # tsc for e2e/
```

The command starts `MOCK=stub AUTH_REQUIRED=false npm run start:dev -w client`
on port 9000, or reuses a server already listening there. To test a server you
started yourself, point the suite at it:

```bash
MOCK=stub AUTH_REQUIRED=false npm run start:dev -w client -- --port 7016
PLAYWRIGHT_BASE_URL=http://127.0.0.1:7016 npm run test:e2e:prototype
```

First time only: `npx playwright install chromium`.

### Static build, at the root or under a base path

The GitHub Pages build (see "Static hosting on GitHub Pages" in
`docs/prototype-architecture.md`) is served by a static server with no
rewrites. `e2e/support/static-server.mjs` mimics GitHub Pages (unknown paths
get `404.html` with status 404). A build only works under the base path it was
built for, so build once per base:

```bash
# Root, port 7400
npm run build:prototype:static -w client
npm run serve:static -- --dir client/dist --port 7400 &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:7400/ npm run test:e2e:prototype

# Subpath /tackle2-ui/, port 7401
BASE_PATH=/tackle2-ui/ npm run build:prototype:static -w client
npm run serve:static -- --dir client/dist --port 7401 --mount /tackle2-ui/ &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:7401/tackle2-ui/ npm run test:e2e:prototype
```

Stop the server afterwards (`kill %1`). The base URL may carry a path; the
config adds a trailing slash. `navigation/static-hosting.spec.ts` covers what
static hosting can break (deep links with query strings, `404.html` loads,
reload resets, table state in the URL, a request audit, translations, the
service worker scope, template downloads, the visitor guide).

### Live smoke in Chromium, Firefox and WebKit

Tests tagged `@smoke` form a short smoke run. `PLAYWRIGHT_ALL_BROWSERS=true`
adds Firefox and WebKit projects that run only `@smoke` tests:

```bash
npx playwright install firefox webkit   # first time only
PLAYWRIGHT_ALL_BROWSERS=true \
  PLAYWRIGHT_BASE_URL=https://daviddcohen.github.io/tackle2-ui/ \
  npm run test:e2e:prototype -- --grep @smoke
```

Failures keep a screenshot, a trace and the error context under
`test-results/playwright/`; open a trace with
`npx playwright show-trace <path>/trace.zip`.

The full run (642 tests) takes about 13 minutes with 4 workers
(`--workers=4`, measured with another e2e run on the same machine); the
navigation link sweep (`navigation/entity-links.spec.ts`, about 4.5 minutes,
its "stages" group the longest at about 3.5) is the longest part.

## What each folder covers

| Folder             | Covers                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config-plane/`    | Configuration plane: Models, Providers, Agents, Skills and Skill collections. Lists, row actions and in-use guards, create/edit forms and validation, RBAC per persona, cross-entity effects of renames and deletes, and a per-persona/scenario page-health matrix (no console errors, raw i18n keys, `undefined`/`NaN`). |
| `execution-plane/` | Execution plane: the inventory Migration column and next actions, preflight and starting migrations, plan runs (list and its filters, detail, approval, stage progression, stage runs), the plan wizard, plan impact, and execution RBAC per persona.                                                                     |
| `navigation/`      | Routes, sidebar and perspectives, breadcrumbs and navigation context (history-state trails, legacy `?from=` links, an exhaustive link sweep), not-found states, URL-backed tabs, the prototype switcher, and regression checks for the upstream (non-agentic) pages the prototype touched.                                |
| `data-layer/`      | The mock API contract (status codes, id semantics, referential integrity), query behavior seen on the network (no retries on 404, no `/NaN` requests), cache invalidation after writes, and polling policy (driven by Playwright's fake clock).                                                                           |
| `support/`         | Shared helpers, imported as `../support`: `test`/`expect` with fixtures, prototype URLs, locators and interactions, mock API calls, the fixture graph.                                                                                                                                                                    |

## Conventions

- **Import from `../support`**, not `@playwright/test`, so every spec shares the
  same `test` fixtures (`pageErrors`, `diagnostics` + `expectHealthy`).
- **Prototype state is explicit.** Build every URL with
  `protoUrl(path, { persona, scenario, stage })` (defaults: Enterprise Architect,
  `configured`). Never rely on switcher defaults or a hard-coded host: the base
  URL comes from `playwright.config.cjs`.
- **Base-path safe.** `protoUrl` returns a relative path (no leading slash) so
  it resolves under the base URL; never `page.goto("/...")`. Compare a browser
  pathname as a router path with `appPath(url.pathname)` (or `appUrl(url)`),
  and match rendered hrefs with `withBase("/plan-runs/1")`
  (`a[href^="${withBase("/skills/")}"]`). Both are no-ops at the root. Under a
  base, `appPath` marks a pathname outside it (`<outside base>/x`), so a URL
  that escaped the base never matches a router path.
- **Mock state lives in the page.** MSW resets on every `page.goto`, so each
  test starts from the fixtures and tests are independent and parallel-safe. To
  check the effect of a write on another page, navigate in-app (click a link or
  `spaNavigate`), never `page.goto`.
- **Selectors:** roles and accessible names first (`getByRole`, `field(dialog,
"Name")` for labelled inputs). Ids only where PatternFly gives no unique
  accessible name (typeahead inputs such as `#model-provider-select-input`).
  Copy may move to i18n keys, but English text stays the same.
- **No sleeps.** Use web-first assertions (`await expect(locator)...`) and
  `expect.poll`. `nextFrames(page)` waits two animation frames for UI that
  settles "a frame later"; polling tests advance a fake clock. Do not add
  `waitForTimeout`. `waitForLoadState("networkidle")` is used only where a test
  asserts that something does _not_ happen after all data has loaded.
- **Long timeouts are explained.** React Query retries 5xx responses before an
  error state appears, and the `loading` scenario delays every response; those
  assertions pass a `{ timeout: 20_000 }` with a comment.
- **Known defects:** a test that asserts correct behavior for a known open bug is
  marked `test.fail(true, "<short reason>")` with a comment naming the issue and
  listed below. When the bug is fixed Playwright reports "expected to fail but
  passed": remove the marker and the entry here.
- No screenshots or files written by tests (Playwright captures them on failure),
  no `console.log`.

## Known open issues (`test.fail`)

| Test                                                                                                           | Issue                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation/switcher.spec.ts` "an out-of-range stage is clamped to the run's stages and shown in the switcher" | `protoStage` has no upper bound: `?protoStage=999` stays in the URL and the Stage control shows 1 (it always offers 1-5) while the run renders its last stage. Prototype switcher only.            |
| `navigation/upstream-regression.spec.ts` "upstream default columns are visible without opening Manage columns" | Product decision pending: the prototype hides 5 upstream inventory columns (Business Service, Assessment, Review, Tags, Effort) by default. Restore them or delete the test.                       |
| `execution-plane/stage-observability.spec.ts` "arrow keys move between the tabs"                               | PatternFly 6.7 `Tabs` render `role="tablist"` and `role="tab"` but handle no arrow keys, so Left/Right (WAI-ARIA tabs pattern) do nothing; Tab and Enter/Space work. Affects every PF tabbed page. |
