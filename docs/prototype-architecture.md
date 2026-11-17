# Agentic Migration Prototype Architecture

## Purpose

This repository is a functional MVP prototype on top of tackle2-ui. Its agentic screens, fixtures, state switcher, and mock transport exist to validate product behavior. They are not a production API implementation.

## Shared prototype state

The switcher adapts the global state contract from an earlier prototype's `PrototypeScopeSwitcher`. It is the only source of truth for persona, scenario, and stage (`protoPersona`, `protoScenario`, `protoStage`). State is encoded in URL query parameters so a view is bookmarkable and survives refresh. Only the switcher and the mock server (`client/src/mocks/stub-new-work/agentic/prototype-state.ts`) read this state. Production-facing pages render from routes, scopes, and query data.

The switcher is mounted only in development bundles with `AUTH_REQUIRED=false` and `MOCK` stubbing the agentic endpoints (`isPrototypeEnabled`): `client/src/index.tsx` loads `client/src/app/layout/PrototypeShell/` and hands it to `App`. No production module imports `client/src/app/prototype/**`.

Explicit user actions update affected records through query mutations. They do not move the global scenario or change unrelated records. Page-local status overrides and cached browser state must never supersede the switcher.

The persona selection maps to existing masquerade presets so route and action access continue to use scope checks:

| Prototype persona    | Hub role preset | Starting surface                   |
| -------------------- | --------------- | ---------------------------------- |
| Platform Engineer    | Admin           | Models in Administration           |
| Enterprise Architect | Architect       | Application Inventory in Migration |
| Hub Migrator         | Migrator        | Application Inventory execution    |

Persona names are demonstration metadata only. Production code authorizes with scopes and RBAC. Vanilla Konveyor perspective behavior is preserved: Admin can use Administration and Migration, while Architect and Migrator receive Migration only. Application Architect is documented as a downstream persona but has no distinct current Hub role mapping.

## Projection boundary

The current Hub role seed defines agentic scopes, but Hub OpenAPI does not expose the prototype endpoints. Frontend domain contracts therefore live in `client/src/app/agentic/`, outside `api/models.ts`, which is reserved for established Hub API types. Production-facing pages import this normal domain module. Switcher state remains in `client/src/app/prototype/agentic/`; scenario worlds and the mock server live in `client/src/mocks/stub-new-work/agentic/`. Mock handlers use a prototype-specific route prefix (`/hub/prototype/agentic/*`) and must not be interpreted as real Hub endpoints. Pure mappers from the real CRD contract to the domain types are in `client/src/app/agentic/adapters/`, ready for integration but not wired.

The projection layer combines:

- Hub application, archetype, and target profile fixtures
- Controller-shaped reusable configuration concepts
- Application-specific preflight and run views
- Scenario state read only by mock handlers
- Hub-owned default Model policy, separate from the controller-oriented Gateway shape
- Effective Skill associations across Agent, archetype, target profile, and application scopes

The projection layer keeps configuration checks, application preflight, controller run phase, and human intervention independent.

## Production replacements

The hand-off guide, [agentic-handoff.md](agentic-handoff.md), has the endpoint inventory, field mapping and wiring checklist. Status of each replacement:

Done in the prototype:

- The switcher, its URL parameters and masquerade preset changes are development-only and stripped from production builds (`isPrototypeEnabled`). The portfolio-size generator is gone; the scenario generator moved into the mock server.
- The production Express server serves no prototype routes; `AGENTIC_ENABLED` gates every agentic route and surface.
- Explicit actions (start, approve) are server mutations. Pages no longer move the global scenario or read mock globals.
- TanStack Query hooks with loading, not-found, error, polling and invalidation behavior (`client/src/app/queries/agentic.ts`).
- Stable, opaque, server-assigned identifiers; id-only references in requests; plan runs snapshot their stages.
- Route and action authorization through Hub scopes (`client/src/app/scopes.ts`).
- Exploratory labels and integration-boundary alerts were removed from the execution surfaces.

Still to remove or replace at integration:

- The switcher itself and the mock transport (strip steps in the hand-off guide)
- Fixture-derived Model usage counts and Plan impact counts
- Fixture-derived Configuration Checks and effective Skill provenance
- `ModelProjection.isOrganizationDefault` and its simulated default-selection endpoint
- Simulated preflight outcomes and result links
- The remaining integration-boundary alerts on the Agent test and Skill association surfaces
- `AwaitingApproval` as a run phase (approval becomes an intervention from ACP permission requests)

Replace them with:

- Authenticated Hub APIs: the existing `/hub/agentic/*` CRD endpoints through the adapters, plus Hub contracts, generated from an approved OpenAPI contract, for what has no endpoint yet (application migrations, plan resolution, preflight, providers, default Model, execution policy, results)
- Hub scopes and RBAC for route, field, and action authorization, including the ACP scope for approvals
- Server-owned validation, preflight, interaction, audit, and result contracts
- Relationship endpoints for every referenced resource that has none today

## State and data rules

- Never add prototype execution fields to Hub `Application` API types.
- Never persist a readiness field on a reusable Plan.
- Represent controller run phase only as Pending, Running, Succeeded, or Failed.
- Represent action required separately from controller phase.
- Omit result artifacts until a product-facing Hub result contract exists.
- Use explicit ID checks such as `id != null`.
- Keep mock relationships deterministic across Models, Agents, Skills, Plans, archetypes, target profiles, and applications.
- Use TanStack Query for remote or mock-server state. Use React context only for prototype switcher state.
- Use react-hook-form and Yup for forms.
- Use table-controls for table filtering, sorting, selection, and pagination.

## Route behavior

Changing persona is an explicit demo action that opens the recommended starting route. Normal Konveyor navigation then remains authoritative. Scenario and stage changes retain the current route and refresh query data. The prototype does not force any persona onto a route, replace the standard sidebar, or use persona and scenario strings to grant permissions.

## Integration boundary

The controller is domain agnostic. The Hub must own product vocabulary, application-to-Plan resolution, portfolio authorization, audit, credential mediation, and application-specific result presentation. The Migration Tab, IDE, and CLI consume governed policy and execution results. They do not manage Hub Models, Agents, Plans, Stages, or Skills.

## Static hosting on GitHub Pages

The prototype runs entirely in the browser (MSW answers the Hub and agentic APIs), so it can be published as static files. The fork `daviddcohen/tackle2-ui` publishes its `main` branch at:

- Live prototype: https://daviddcohen.github.io/tackle2-ui/
- Visitor guide: https://daviddcohen.github.io/tackle2-ui/prototype-guide/ (source `client/public/prototype-guide/index.html`, also linked from the switcher as "How to use this preview")

Mock data lives in the visitor's browser and resets on every reload or new link; nothing is stored on a server.

### Static build

```bash
STATIC_HTML=true BASE_PATH=/tackle2-ui/ npm run build:prototype -w client
# same as
BASE_PATH=/tackle2-ui/ npm run build:prototype:static -w client
```

`client/dist/` then holds `index.html` and an identical `404.html` (GitHub Pages serves it for any path it has no file for, so deep links and query strings load the app), `.nojekyll`, `mockServiceWorker.js` and `prototype-guide/`. `window._env` is rendered at build time by the Node server's own serializer with `MOCK=stub` and `AUTH_REQUIRED=false`.

`BASE_PATH` (default `/`) is the path the site is served under. It becomes the `<base href>` of the page; the app reads it back from `document.baseURI` for the router basename, the service worker URL and scope, and locale loading. Without `BASE_PATH`, or without `STATIC_HTML`, the build behaves as before.

### Serving it locally

`e2e/support/static-server.mjs` (root script `npm run serve:static`) is a dependency-free server that behaves like GitHub Pages: directory index, `<mount>` redirects to `<mount>/`, unknown paths get `404.html` with status 404, no rewrites, bound to 127.0.0.1.

```bash
# At the root
npm run build:prototype:static -w client
npm run serve:static -- --dir client/dist --port 7400
# open http://127.0.0.1:7400/

# Under the Pages subpath
BASE_PATH=/tackle2-ui/ npm run build:prototype:static -w client
npm run serve:static -- --dir client/dist --port 7401 --mount /tackle2-ui/
# open http://127.0.0.1:7401/tackle2-ui/
```

A build serves correctly only under the base path it was built for. Running the Playwright suite against either server is described in `e2e/README.md`.

### The Pages workflow

`.github/workflows/prototype-pages.yaml` (a fork-only file name, so syncs never conflict) runs on every push to `main` and on demand (`workflow_dispatch`). One concurrency group (`pages`, never cancelled) keeps deploys in order. Actions are pinned to commit SHAs; no secrets are used.

- `build` (`contents: read`): `npm ci`, the static build with `BASE_PATH=/<repository name>/`, upload of `client/dist` as the Pages artifact.
- `deploy` (`pages: write`, `id-token: write`, environment `github-pages`): publishes the artifact. It runs only after a green build, so a failed build leaves the last good site up and shows as a failed run.
- `quiet-upstream` (`actions: write`, independent of the deploy): disables every active workflow except this one.

### Keeping the upstream workflows quiet

The fork carries the 16 upstream Konveyor workflows (CI, image builds to quay, nightlies, stale and issue bots). They stay unedited so syncs from upstream and staging apply cleanly; instead the `quiet-upstream` job disables them in the fork's Actions settings, on every run. A workflow that a later sync adds is disabled on the next run (it may run once before that, for example on the push that adds it). The job is idempotent and logs what it kept, skipped and disabled.

Owner, once:

1. Settings > Pages > Build and deployment > Source: "GitHub Actions" (already set on the fork).
2. Turn on Actions for the fork (Actions tab, or Settings > Actions > General), then right away Actions > "Prototype Pages" > Run workflow on `main`. That run disables the upstream workflows and publishes the site. Hold syncs into `main` until it is green.

To re-enable an upstream workflow on purpose, enable it in the Actions tab and remove or adjust the guard job first, or it is disabled again on the next run.

### On push to main, and re-running

Every push to `main` rebuilds and redeploys; the site updates within a few minutes (browsers may keep the previous `index.html` for up to about 10 minutes). To redeploy without a push, or after a failure: Actions > "Prototype Pages" > Run workflow (branch `main`), or `gh workflow run prototype-pages.yaml --repo daviddcohen/tackle2-ui --ref main`. A failed run can also be re-run from its run page.
