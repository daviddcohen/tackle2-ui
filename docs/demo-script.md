# Agentic Migration Prototype Demo

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
4. Confirm the migration path relationship, ordered Stages, Agent assignments, approved Models, and effective Skill provenance.
5. Create or edit a blank Plan and verify that the wizard distinguishes reusable Plan configuration from application-specific migration proposals.
6. Open Agents and Skills to show how reusable objects connect without exposing controller resource names. Agent creation is hidden because the current Hub architect role grants Agent read access only.
7. Inspect Skill associations and confirm the effective Agent, archetype, target profile, and application provenance plus the prototype contract boundary.

## Enterprise Architect portfolio execution

1. Select Enterprise Architect and Preflight blocked.
2. Open Application Inventory, select applications, and choose Actions > Run migration plan to open preflight. A single application can also be started from its row actions.
3. Review ready, blocked, and review-required outcomes. Blocked applications are excluded from the start. In the Migration column, Blocked and Review before start show the reason under the status, and the status opens the application's Migration tab with the blocker.
4. Change the scenario to Running and inspect application and stage progress in the Migration column. A running row shows its plan and current stage under the status; the status opens the application's Migration tab, which links to the plan run.
5. Change the scenario to Action required. The alert above the inventory counts the applications that need action; "Show applications" filters the inventory to them. Each Action required status opens the application's Migration tab, where the request is approved or rejected. On a plan run, the alert under the title names the stage awaiting approval and offers "Approve and continue", which asks for confirmation first.
6. Change the scenario to Failed. On the application's Migration tab, inspect the failure evidence in the alert and choose Run migration plan; on the failed plan run, choose Run migration plan in the alert (preflight is prefilled with the run's applications and target branch, and keeps each application's own Plan when it is still the run's Plan). In-place retry and resume are not claimed.
7. Start a ready application and observe Pending, Running, and Succeeded through polling.
8. Change the scenario to Completed. The Succeeded status opens the application's Migration tab, which shows the target branch and commits and links to the plan run.

## Hub Migrator

1. Select Hub Migrator (Migrator).
2. Confirm that the persona starts in Application Inventory.
3. Confirm that Administration is unavailable.
4. Confirm that Migrator scopes permit application execution while Agent, Plan, Stage, and Skill configuration remains read only.
5. Start a ready migration and inspect the application-specific run.
6. Note that Application Architect and Corporate Developer flows remain in RHDH, IDE, or CLI surfaces and are not fabricated inside Hub.
