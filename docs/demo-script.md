# Agentic Migration Prototype Demo

The prototype is published at https://daviddcohen.github.io/tackle2-ui/ (visitor guide: https://daviddcohen.github.io/tackle2-ui/prototype-guide/). Data is mock and resets on reload. How the site is built and deployed: [Static hosting on GitHub Pages](prototype-architecture.md#static-hosting-on-github-pages).

## Platform Engineer

1. Select Platform Engineer and Configured.
2. Open Models in Administration.
3. Review Verified, Unreachable, and Pending Models, the organizational default, credential references, and Agent usage.
4. Edit a Model and verify that secret values are never displayed.
5. Save a Model and observe Pending change to Verified when the mock controller status is observed.
6. Set another Model as the organizational default and confirm that exactly one badge moves.
7. Note that the requirement is established, but persistence is a Hub policy projection because the controller contract does not define it.
8. Use the standard perspective selector to open Migration, then return to Administration. This verifies the real administrator scope behavior.

## Enterprise Architect configuration

1. Select Enterprise Architect and Partial configuration.
2. Open Plans and select a Plan with configuration issues.
3. Review derived Configuration Checks instead of a persisted readiness status.
4. Confirm the target profiles that use the Plan, ordered Stages, Agent assignments, verified Models, and the skills each stage gets with where each comes from. Target profiles of several archetypes can share a Plan: on the Plans list, Java lift and shift shows "2 target profiles" (OpenJDK 21 on OpenShift on Java EE Application, Java 8 on OpenShift on Legacy Java Application).
5. Create or edit a blank Plan and verify that the wizard distinguishes reusable Plan configuration from application-specific migration proposals. The wizard does not pick archetypes or target profiles: a target profile picks its Plan on its archetype's target profiles page (Assign migration plan or Change migration plan), which offers every Plan.
6. Open Agents and Skills to show how reusable objects connect without exposing controller resource names. Agent creation is hidden because the current Hub architect role grants Agent read access only.
7. Open a skill's Usage tab and confirm what it is attached to (agent, archetype, target profile, application), the plan stages that get it, and the prototype contract boundary.
8. Open Archetypes, select Java EE Application and open its Skills tab: it lists only the archetype's own skills, which its applications inherit. A target profile is one of the archetype's migration paths (Java EE Application has two: Quarkus 3.x and OpenJDK 21 on OpenShift, each with its own migration plan), so its skills are on the target profiles page ("View target profiles") and reach agents only when a migration plan runs on it.
9. Open Claims Processing (`/applications/3?tab=skills`): its Skills tab lists the application's and its archetype's skills, and says that each stage's agent skills and the target profile skills are added when a migration plan runs. Its link opens the Migration tab at Skills by stage: what each stage got in the latest plan run. An application without a run says that Run migration plan lists them before the run starts.
10. On a skill the agent does not have yet (for example Spring Boot 3 upgrade, `/skills/16`), choose Actions > Test with an agent, pick Code Migrator, an application and a task, and start the test run. The agent's own skills show as already included in the Added skills picker, and nothing is saved on the agent. On the agent's Runs tab the Test runs table lists the added skills. The seeded runs show the comparison: the same task on Inventory Service without added skills (Failed) and with Spring Boot 3 upgrade and Quarkus best practices added (Succeeded).

## Enterprise Architect portfolio execution

1. Select Enterprise Architect and Preflight blocked.
2. Open Application Inventory, select applications, and choose Run migration plan in the toolbar kebab to open preflight. A single application can also be started from its row actions.
3. Optionally expand Skills by stage (collapsed by default) to review what each stage's agent gets in each plan run Run would start. Clear a skill to exclude it from that run (every stage and every application of the run, an application's own skills included); a skill the migration plan excludes shows "Excluded by plan" and cannot be included again. The toggle then counts the run's exclusions, and the plan run page lists them above its Skills by stage. When several of an application's target profiles have a migration plan, its row has a Target profile select. Java EE and Legacy Java applications have two each, so with "Use each application's migration plan" Run stays off until a profile is picked for them, and the pick decides the plan. With one migration plan for all (or Run from a plan's page), an application whose target profiles use that plan once gets that profile without a pick.
4. Review ready, blocked, and review-required outcomes. Blocked applications are excluded from the start. In the Migration column, Blocked and Review before start show the reason under the status, and the status opens the application's Migration tab with the blocker.
5. Change the scenario to Running and inspect application and stage progress in the Migration column. A running row shows its plan and current stage under the status; the status opens the application's Migration tab, which links to the plan run.
6. Change the scenario to Action required. The alert above the inventory counts the applications that need action; "Show applications" filters the inventory to them. Each Action required status opens the application's Migration tab, where the request is approved or rejected. On a plan run, the alert under the title names the stage awaiting approval and offers "Approve and continue", which asks for confirmation first.
7. Change the scenario to Failed. On the application's Migration tab, inspect the failure evidence in the alert and choose Run migration plan; on the failed plan run, choose Run migration plan in the alert (preflight is prefilled with the run's applications, target branch and the skills it excluded on its own, and keeps each application's own Plan when it is still the run's Plan). In-place retry and resume are not claimed.
8. Start a ready application and observe Pending, Running, and Succeeded through polling.
9. Change the scenario to Completed. The Succeeded status opens the application's Migration tab, which shows the target branch and commits and links to the plan run.

## Hub Migrator

1. Select Hub Migrator (Migrator).
2. Confirm that the persona starts in Application Inventory.
3. Confirm that Administration is unavailable.
4. Confirm that Migrator scopes permit application execution while Agent, Plan, Stage, and Skill configuration remains read only.
5. Start a ready migration and inspect the application-specific run.
6. Note that Application Architect and Corporate Developer flows remain in developer portals, the IDE, or the CLI and are not fabricated inside Hub.
