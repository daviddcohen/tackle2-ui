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

The controller is domain agnostic. The Hub must own product vocabulary, application-to-Plan resolution, portfolio authorization, audit, credential mediation, and application-specific result presentation. The RHDH Migration Tab, IDE, and CLI consume governed policy and execution results. They do not manage Hub Models, Agents, Plans, Stages, or Skills.
