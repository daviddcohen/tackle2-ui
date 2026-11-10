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

Failures keep a screenshot, a trace and the error context under
`test-results/playwright/`; open a trace with
`npx playwright show-trace <path>/trace.zip`.

The full run takes about 6 minutes with 4 workers (`--workers=4`); the
navigation link sweep (`navigation/entity-links.spec.ts`) is the longest part.

## What each folder covers

| Folder             | Covers                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config-plane/`    | Configuration plane: Models, Providers, Agents, Skills and Skill collections. Lists, row actions and in-use guards, create/edit forms and validation, RBAC per persona, cross-entity effects of renames and deletes, and a per-persona/scenario page-health matrix (no console errors, raw i18n keys, `undefined`/`NaN`). |
| `execution-plane/` | Execution plane: the inventory Migration column and next actions, preflight and starting migrations, plan runs (list, detail, approval, stage progression, stage runs), the plan wizard, plan impact, and execution RBAC per persona.                                                                                     |
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

| Test                                                                                                           | Issue                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation/switcher.spec.ts` "an out-of-range stage is clamped to the run's stages and shown in the switcher" | `protoStage` has no upper bound: `?protoStage=999` stays in the URL and the Stage control shows 1 (it always offers 1-5) while the run renders its last stage. Prototype switcher only. |
| `navigation/upstream-regression.spec.ts` "upstream default columns are visible without opening Manage columns" | Product decision pending: the prototype hides 5 upstream inventory columns (Business Service, Assessment, Review, Tags, Effort) by default. Restore them or delete the test.            |
