import {
  ApplicationMigrationPath,
  ApplicationMigrationView,
  EntityId,
  EntityRef,
  MigrationPlan,
  StartApplicationMigrationsRequest,
} from "@app/agentic";
import { Ref } from "@app/api/models";
import { universalComparator } from "@app/utils/utils";

/** One selected application and its migration view, as the dialog lists it. */
export interface PreflightRow {
  application: Ref;
  migration: ApplicationMigrationView;
}

/** The plan choice of the Run migration plan dialog. */
export interface PlanChoice {
  planSelection: "recommended" | "single";
  planId: EntityId;
}

/** The target profile the user picked per application id. */
export type TargetProfilePicks = Readonly<Record<number, number>>;

/**
 * The target profile an application runs on, for the dialog's plan choice:
 * - `server`: the server does not report the application's target profiles
 *   (`migrationPaths`): the run uses its default, nothing is sent, and
 *   `path` (from `targetProfile` and `plan`) is shown as text;
 * - `loading`: one plan for all, and that plan's migration path is not
 *   known yet (the plans list loads);
 * - `picked`: the run uses `path` (null: no target profile), picked by the
 *   user among `candidates` or the only choice there is; it is sent;
 * - `required`: several candidates and none picked (the server's default
 *   is not one of them): Run waits for a pick.
 */
export type TargetProfileChoice =
  | { kind: "server"; path?: ApplicationMigrationPath }
  | { kind: "loading" }
  | {
      kind: "picked";
      path: ApplicationMigrationPath | null;
      candidates: ApplicationMigrationPath[];
    }
  | { kind: "required"; candidates: ApplicationMigrationPath[] };

/**
 * Which target profile an application runs on. "Use each application's
 * migration plan": any profile of its archetypes (the pick decides the
 * plan). One plan for all: the profiles of that plan's migration path on
 * the application's archetypes; none when the plan has no path there.
 * Several candidates: the user's pick, else the server's default when it is
 * one of them, else a pick is required.
 */
export const targetProfileChoice = (
  migration: ApplicationMigrationView,
  choice: PlanChoice,
  plan: MigrationPlan | undefined,
  pickedId: number | undefined
): TargetProfileChoice => {
  const paths = migration.migrationPaths;
  if (paths == null) {
    return {
      kind: "server",
      path:
        migration.targetProfile != null && migration.archetype != null
          ? {
              archetype: migration.archetype,
              targetProfile: migration.targetProfile,
              plan: migration.plan,
            }
          : undefined,
    };
  }
  let candidates = paths;
  if (choice.planSelection === "single") {
    if (plan == null) return { kind: "loading" };
    const planPath = plan.migrationPath;
    candidates = paths.filter(
      ({ archetype, targetProfile }) =>
        planPath?.archetype.id === archetype.id &&
        planPath.targetProfiles.some(({ id }) => id === targetProfile.id)
    );
  }
  if (candidates.length <= 1) {
    return { kind: "picked", path: candidates[0] ?? null, candidates };
  }
  const byId = (id: number | undefined) =>
    id != null
      ? candidates.find(({ targetProfile }) => targetProfile.id === id)
      : undefined;
  const path = byId(pickedId) ?? byId(migration.targetProfile?.id);
  return path != null
    ? { kind: "picked", path, candidates }
    : { kind: "required", candidates };
};

/** One plan run the Run button starts: a plan and its ready applications. */
export interface StartGroup {
  plan: EntityRef;
  /** The plan with its stages, when the plans list has it (the preview needs them). */
  migrationPlan?: MigrationPlan;
  /** In the dialog's order (by name). */
  applications: Ref[];
  /**
   * The target profile each application runs on, by application id (null:
   * none). An application the server reports no target profiles for is
   * left out: it runs on the server's default.
   */
  targetProfiles: Map<number, number | null>;
  /** An application still needs a target profile (picked, or the plan to load). */
  isTargetProfileMissing: boolean;
}

/**
 * The plan runs the Run button starts, from the ready applications only.
 * "Use each application's migration plan" groups them by
 * the plan of the target profile they run on (an application without one
 * starts nothing). "Use one migration plan for all applications" is one
 * group with the picked plan, none before a plan is picked. Groups are
 * ordered by plan name. The dialog's skills preview and its submit both
 * read this, so the preview shows exactly the runs that start.
 */
export const groupReadyApplicationsByPlan = (
  rows: PreflightRow[],
  choice: PlanChoice,
  plans: MigrationPlan[],
  picks: TargetProfilePicks = {}
): StartGroup[] => {
  const ready = rows.filter(({ migration }) => migration.preflight === "ready");
  const planById = (id: EntityId) => plans.find((plan) => plan.id === id);
  const singlePlan =
    choice.planSelection === "single" ? planById(choice.planId) : undefined;

  const groups = new Map<EntityId, StartGroup>();
  const add = (
    plan: EntityRef,
    { application }: PreflightRow,
    profile: TargetProfileChoice
  ) => {
    const group: StartGroup = groups.get(plan.id) ?? {
      plan,
      migrationPlan: planById(plan.id),
      applications: [],
      targetProfiles: new Map(),
      isTargetProfileMissing: false,
    };
    group.applications.push(application);
    if (profile.kind === "picked") {
      group.targetProfiles.set(
        application.id,
        profile.path?.targetProfile.id ?? null
      );
    }
    if (profile.kind === "loading" || profile.kind === "required") {
      group.isTargetProfileMissing = true;
    }
    groups.set(plan.id, group);
  };

  if (choice.planSelection === "single") {
    if (choice.planId === "") return [];
    const plan = {
      id: choice.planId,
      name: singlePlan?.name ?? String(choice.planId),
    };
    ready.forEach((row) =>
      add(
        plan,
        row,
        targetProfileChoice(
          row.migration,
          choice,
          singlePlan,
          picks[row.application.id]
        )
      )
    );
    return [...groups.values()];
  }

  ready.forEach((row) => {
    const profile = targetProfileChoice(
      row.migration,
      choice,
      undefined,
      picks[row.application.id]
    );
    const plan =
      profile.kind === "picked"
        ? profile.path?.plan
        : profile.kind === "server"
          ? row.migration.plan
          : undefined;
    if (plan != null) add(plan, row, profile);
  });
  return [...groups.values()].sort((a, b) =>
    universalComparator(a.plan.name, b.plan.name)
  );
};

/** The application ids the Run button sends: every group's, in order. */
export const startApplicationIds = (groups: StartGroup[]) =>
  groups.flatMap((group) =>
    group.applications.map((application) => application.id)
  );

/** The target profile picks the Run button sends; absent when there are none. */
export const startTargetProfiles = (
  groups: StartGroup[]
): StartApplicationMigrationsRequest["targetProfiles"] => {
  const picks = groups.flatMap((group) =>
    [...group.targetProfiles].map(([applicationId, targetProfileId]) => ({
      application: { id: applicationId },
      targetProfile: targetProfileId != null ? { id: targetProfileId } : null,
    }))
  );
  return picks.length > 0 ? picks : undefined;
};
