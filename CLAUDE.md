# tackle2-ui

Konveyor UI -- React + PatternFly frontend for the application modernization platform.

## Context Files

- [AGENTS.md](AGENTS.md) -- Directory structure, review checklist, dependencies
- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design, data flow, deployment
- [CONTRIBUTING.md](CONTRIBUTING.md) -- Coding standards, PR process, testing

Conventions: see [.cursor/rules/tackle2-ui.mdc](.cursor/rules/tackle2-ui.mdc) or [AGENTS.md](AGENTS.md) for the full list.

## Key Rules

- Use `id != null` for ID checks, never truthy (`if (id)`)
- File names use kebab-case
- All user-facing strings go through `react-i18next` (`useTranslation` hook)
- Import order: react -> external -> @patternfly -> @konveyor-ui/@app -> relative

## AI Principles

1. **Think before coding** — state assumptions, ask when uncertain, suggest simpler approaches
2. **Simplicity first** — minimum code that solves the problem, no speculative features or abstractions
3. **Surgical changes** — touch only what the task requires, match existing style, don't refactor uninvited
4. **Goal-driven execution** — define success criteria upfront, verify each step before moving on

## Commands

```bash
npm run start:dev      # Dev server (port 9000) with port forwarding
npm run test           # Unit tests (Jest)
npm run lint           # ESLint
npm run format:check   # Prettier check
```

## Agentic migration prototype (this branch)

This branch adds the agentic migration UX prototype on top of tackle2-ui. The agentic API is mocked with MSW; run it with `MOCK=stub AUTH_REQUIRED=false npm run start:dev`. The agentic UI is gated by `AGENTIC_ENABLED` (defaults on when `MOCK` stubs the agentic endpoints) and the persona/scenario switcher runs only in development bundles with that mock.

- `docs/agentic-handoff.md` -- backend hand-off: mocks, data layer, endpoint inventory, CRD field mapping, wiring checklist (adapters in `client/src/app/agentic/adapters/`)
- `docs/prototype-architecture.md` -- prototype boundaries: switcher state, mock transport, what production code may import
- `docs/navigation-context-handoff.md` -- breadcrumb / navigation context contract
- `docs/demo-script.md` -- demo walkthrough (`Dockerfile.prototype` and `build:prototype` build the demo image)

Prototype end-to-end specs: `npm run test:e2e:prototype` (Playwright, `e2e/`).

Context:

- Scope: a configuration plane (agents, skills, models, workflows) and an execution plane (migration runs)
- Upstream ships a dev-preview agentic console from [konveyor/tackle2-ui#3546](https://github.com/konveyor/tackle2-ui/pull/3546); this design work starts from scratch. On this branch the prototype replaces that dev-preview console; its real-backend client is kept in `client/src/app/api/agentic/` and `client/src/app/api/rest/agent-runs.ts` as the wiring reference.
- Related repos: [konveyor/agentic-controller](https://github.com/konveyor/agentic-controller) (backend controller), [yuvalgalanti/MTA-Agentic-Migration-](https://github.com/yuvalgalanti/MTA-Agentic-Migration-) (concept prototype)
