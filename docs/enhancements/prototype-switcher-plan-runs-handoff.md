# Handoff: Prototype Switcher × Plan Runs

**Date:** 2026-10-04  
**Author:** David Cohen + Claude

---

## What was changed and why

Two gaps existed in the prototype:

1. **Plan run detail pages were scenario-blind.** Navigating to `/plan-runs/6?protoScenario=running` showed the same static mock data as `configured`. The prototype switcher had no effect on plan run state.

2. **Starting a migration from Application Inventory went nowhere.** After clicking "Start migration plan" and confirming in the preflight modal, a success toast appeared but the user had to manually navigate to Plan Runs — killing any demo continuity.

Both were addressed in a single commit.

---

## Files changed

### `client/src/mocks/stub-new-work/agentic/handlers.ts`

The main change. Three additions:

**`runningScenarioStartTimes: Map<number, number>`**  
Tracks when the `running` scenario was first activated per run ID. Cleared on `PROTOTYPE_FIXTURE_RESET_EVENT`. Used to compute elapsed time for tick-on-read.

**`generateProgressMessages(stageName, elapsedMs, startedAt): StageMessage[]`**  
Returns a pre-written 7-message script filtered to only messages whose `relativeMs ≤ elapsedMs`. The script runs 0 → 42 seconds. Each read adds more messages, simulating live agent output.

**`applyScenarioToPlanRun(run, scenario, plan): PlanRun`**  
Transforms any `PlanRun` based on the current scenario. Only fires for execution scenarios (`queued`, `running`, `actionRequired`, `failed`). Non-execution scenarios (`configured`, `initial`, etc.) return the run unchanged.

| Scenario         | Transformation                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queued`         | All stages `Pending`, run status `Pending`                                                                                                                                  |
| `running`        | First stage `Running` + tick-on-read messages, others `Pending`                                                                                                             |
| `actionRequired` | All stages before the first `requiresApproval` stage → `Succeeded`; that stage → `AwaitingApproval` with proposal messages and a generated commit; later stages → `Pending` |
| `failed`         | First stage `Failed` with error output and two agent messages; others `Pending`                                                                                             |

**`GET /plan-runs/:runId`** now calls `applyScenarioToPlanRun` before responding.

**`POST /application-migrations`** now also:

1. Resolves the best plan for the selected apps (by archetype match or first in list as fallback)
2. Creates a `PlanRun` entry in `mockPlanRuns` with all stages `Pending`
3. Stores the new run ID in `(window as unknown as { __latestPlanRunId?: number }).__latestPlanRunId`

### `client/src/app/pages/applications/applications-table/applications-table.tsx`

The `startMigrations` success callback was updated:

- Reads `window.__latestPlanRunId`
- Deselects all apps, closes the modal
- If a plan run was created: navigates to `/plan-runs/:id` with `protoScenario=running` appended (preserving other proto params)
- If no plan run was created (edge case): falls back to a notification

### `client/src/app/pages/agentic/plan-runs/plan-run-detail/plan-run-detail.tsx`

- Added `useAgenticPrototype` to get `setScenario`
- In the `approveStage` mutation's `onSuccess` callback, calls `setScenario('running')` so the page transitions from `actionRequired` to `running` state after approval

### `e2e/agentic-changes.spec.ts`

- Updated one assertion: in `actionRequired` scenario, run 1's stage 1 now has a generated commit hash (`007a69ca`) not the original static one (`a1b2c3d4`)
- Added 7 new tests under `"Plan run detail — scenario-aware state"` covering each scenario variant

---

## Architecture decisions

**Why `window.__latestPlanRunId` instead of changing the API response type?**  
The `POST /application-migrations` response is typed as `ApplicationMigrationMap` (a `Record<number, ApplicationMigrationView>`). Adding a string key would contaminate the type and break the `Object.keys().length` count in callers. A module-level global is prototype-appropriate here — production would use a proper response envelope or a separate `POST /plan-runs` endpoint.

**Why only transform the DETAIL endpoint, not the LIST?**  
The plan runs list page (`/plan-runs`) shows all runs with their natural states (Succeeded, Running, AwaitingApproval, Failed). This diversity is useful for demos — it shows a portfolio of past runs. Transforming the list would make all runs appear in the same state, losing that richness.

**Why tick-on-read instead of a real timer/websocket?**  
MSW handlers run synchronously inside the browser. A real timer would require either a shared mutable module state or SSE. Tick-on-read (compute elapsed time on each GET) is simpler and has no cleanup footprint. The plan run detail page already polls every 5 seconds (`refetchInterval: 5000` in `useFetchPlanRun`), so messages naturally accumulate without any additional code.

**Why `mockRunHash` instead of reusing existing commit hashes?**  
The scenario-generated stage data uses `mockRunHash(runId, stageIndex)` for deterministic but unique commit SHAs that don't collide with real mock data. This makes test assertions stable.

---

## What the prototype switcher currently does (full picture)

The switcher lives at `client/src/app/prototype/agentic/prototype-switcher.tsx` and drives state through `AgenticPrototypeProvider` (`prototype-state.tsx`). State is serialized to URL params (`protoPersona`, `protoScenario`, `protoPortfolio`) and read back on every render.

Scenario → affected surfaces:

| Scenario               | Application Inventory | Plan runs list | Plan run detail                           | Skills    | Agents    | Models        |
| ---------------------- | --------------------- | -------------- | ----------------------------------------- | --------- | --------- | ------------- |
| `initial`              | empty                 | natural        | natural                                   | empty     | empty     | empty         |
| `partialConfiguration` | —                     | natural        | natural                                   | natural   | natural   | all `pending` |
| `configured`           | natural               | natural        | natural                                   | natural   | natural   | natural       |
| `preflightBlocked`     | preflight blocked     | natural        | natural                                   | —         | —         | —             |
| `queued`               | queued per-app        | natural        | **all Pending**                           | —         | —         | —             |
| `running`              | running per-app       | natural        | **first stage Running + live messages**   | —         | —         | —             |
| `actionRequired`       | action required       | natural        | **first approval stage AwaitingApproval** | —         | —         | —             |
| `failed`               | failed per-app        | natural        | **first stage Failed**                    | —         | —         | —             |
| `completed`            | completed             | natural        | natural (no override)                     | —         | —         | —             |
| `loading`              | 10s delay             | —              | —                                         | 10s delay | 10s delay | 10s delay     |
| `apiError`             | 503                   | —              | —                                         | 503       | 503       | 503           |

**Notable gaps in the scenario coverage:**

- `completed` scenario does NOT transform plan run detail (it falls through to natural state). A plan run for `completed` should show all stages Succeeded. This was intentional — most "completed" runs in the mock already have status `Succeeded`. But if you navigate to a "Running" run (like run 4) with `protoScenario=completed`, it still shows as Running.
- The plan runs LIST is never scenario-transformed, so you always see the natural diversity of mock states there.
- The `preflightBlocked` scenario only affects the app inventory preflight display, not other surfaces.

---

## Open questions for the next iteration

1. **Should `completed` override plan run detail?** Currently it doesn't. Adding it would require a "completed" branch in `applyScenarioToPlanRun` that sets all stages to `Succeeded` with commits. This makes sense for demos where you want to show a finished run.

2. **Should the plan runs LIST reflect the scenario?** One option: filter the list to show only runs matching the current scenario's status (e.g., `running` scenario shows only Running runs at the top). Another: leave the list as-is (current behavior) and only transform the detail. The current approach is defensible.

3. **Should the prototype switcher be smarter on plan run pages?** The user specifically asked about this. The current scenario labels (`queued`, `running`, etc.) map semantically to plan run states, but the labels in the dropdown still say "Queued" and "Running" — not "Plan run: queued" or "Execution in progress". A context-sensitive label or tooltip could help orient demos.

4. **Tick-on-read progression past 42 seconds?** After 42 seconds in `running` scenario, all 7 messages are visible and nothing else changes. You could extend the script to auto-advance to a new stage (or to completion) after, say, 60 seconds. This would require adding a stage-advance branch inside `applyScenarioToPlanRun` that checks elapsed time.

5. **The `window.__latestPlanRunId` global is fragile.** It persists across scenario resets because `PROTOTYPE_FIXTURE_RESET_EVENT` only clears `applicationMigrationOverrides`, `modelVerificationStartedAt`, and `runningScenarioStartTimes`. If you reset the prototype and then start a new migration, the old plan run ID lingers until overwritten. This is acceptable for a prototype but worth documenting.

6. **Approve and continue transition.** After approving, the scenario switches to `running` via `setScenario('running')`. This works but uses the React URL state (re-renders the page), which means any tick-on-read timer resets. The running messages start fresh from 0 again. For a demo this is fine, but it could feel abrupt.

---

## How to exercise the new behavior

**Scenario switcher on plan run pages:**

1. Navigate to any plan run: `http://localhost:9001/plan-runs/1?protoPersona=enterpriseArchitect&protoScenario=configured&protoPortfolio=12`
2. Change the Scenario dropdown to each value and observe:
   - `Queued` → all stages show "Pending"
   - `Running` → first stage shows "Running" with messages (more messages appear on each page refresh within the first 42s)
   - `Action required` → first approval stage shows "Awaiting approval" + Approve button
   - `Failed` → first stage shows "Failed" with error output
   - `Configured` → original mock data

**Start migration → navigate to plan run:**

1. In Application Inventory, select 1–3 applications
2. Click the Actions dropdown → "Start migration plan"
3. Complete the preflight form → click "Start"
4. You should be navigated directly to a new plan run at `running` scenario

**Approve a stage:**

1. Navigate to any plan run with `protoScenario=actionRequired`
2. Expand the stage section — it shows "Awaiting approval" with the Approve button
3. Click "Approve and continue"
4. Scenario switches to `running`, plan run refreshes to show first stage Running
