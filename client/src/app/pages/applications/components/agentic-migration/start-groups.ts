import {
  ApplicationMigrationView,
  EntityId,
  EntityRef,
  MigrationPlan,
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

/** One plan run the Run button starts: a plan and its ready applications. */
export interface StartGroup {
  plan: EntityRef;
  /** The plan with its stages, when the plans list has it (the preview needs them). */
  migrationPlan?: MigrationPlan;
  /** In the dialog's order (by name). */
  applications: Ref[];
}

/**
 * The plan runs the Run button starts, from the ready applications only.
 * "Use each application's migration plan" groups them by
 * their own plan, the one their archetype and target profile resolve to
 * (an application without one starts nothing). "Use one migration plan
 * for all applications" is one group with the picked plan, none before a
 * plan is picked. Groups are ordered by plan name. The dialog's skills
 * preview and its submit both read this, so the preview shows exactly the
 * runs that start.
 */
export const groupReadyApplicationsByPlan = (
  rows: PreflightRow[],
  choice: PlanChoice,
  plans: MigrationPlan[]
): StartGroup[] => {
  const ready = rows.filter(({ migration }) => migration.preflight === "ready");
  const planById = (id: EntityId) => plans.find((plan) => plan.id === id);

  if (choice.planSelection === "single") {
    if (choice.planId === "" || ready.length === 0) return [];
    const migrationPlan = planById(choice.planId);
    return [
      {
        plan: {
          id: choice.planId,
          name: migrationPlan?.name ?? String(choice.planId),
        },
        migrationPlan,
        applications: ready.map(({ application }) => application),
      },
    ];
  }

  const groups = new Map<EntityId, StartGroup>();
  ready.forEach(({ application, migration }) => {
    const plan = migration.plan;
    if (plan == null) return;
    const group = groups.get(plan.id) ?? {
      plan,
      migrationPlan: planById(plan.id),
      applications: [],
    };
    group.applications.push(application);
    groups.set(plan.id, group);
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
