import {
  ApplicationMigrationView,
  EntityId,
  getMigrationDisplayStatus,
  getNextActionKey,
} from "@app/agentic";

/** Keys of `agentic.execution.nextActions.*`. */
export type MigrationNextActionKey =
  | "configure"
  | "start"
  | "resolve"
  | "review"
  | "correct"
  | "reviewResults"
  | "monitor";

const NEXT_ACTION_KEYS: readonly MigrationNextActionKey[] = [
  "configure",
  "start",
  "resolve",
  "review",
  "correct",
  "reviewResults",
  "monitor",
];

const isNextActionKey = (key: string): key is MigrationNextActionKey =>
  NEXT_ACTION_KEYS.some((candidate) => candidate === key);

/**
 * Where a next action takes the user:
 * - `configure`: the migration path configuration (archetype target profiles,
 *   where a Plan is assigned, or the Plan list when there is no archetype);
 * - `preflight`: the start migration (preflight) dialog for the application;
 * - `migrationTab`: the application's Migration tab, which holds the preflight
 *   blockers, the pending decision (approve or reject) and the failure evidence
 *   with "Start new run";
 * - `planRun`: the plan run the application is part of.
 */
export type MigrationNextActionTarget =
  | "configure"
  | "preflight"
  | "migrationTab"
  | "planRun";

export interface MigrationNextAction {
  key: MigrationNextActionKey;
  target: MigrationNextActionTarget;
  /** Set when `target` is `planRun`. */
  planRunId?: EntityId;
}

/** The single next action for an application's migration, and where it leads. */
export const getMigrationNextAction = (
  migration: ApplicationMigrationView
): MigrationNextAction => {
  const rawKey = getNextActionKey(getMigrationDisplayStatus(migration));
  const key: MigrationNextActionKey = isNextActionKey(rawKey)
    ? rawKey
    : "monitor";
  switch (key) {
    case "configure":
      return { key, target: "configure" };
    case "start":
      return { key, target: "preflight" };
    case "resolve":
    case "review":
    case "correct":
      return { key, target: "migrationTab" };
    case "reviewResults":
    case "monitor":
      return migration.planRun != null
        ? { key, target: "planRun", planRunId: migration.planRun.id }
        : { key, target: "migrationTab" };
  }
};
