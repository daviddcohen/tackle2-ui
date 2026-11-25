import * as React from "react";

import { ApplicationMigrationMap, PlanRun } from "@app/agentic";
import { Ref } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { BreadcrumbEntry } from "@app/hooks/useBreadcrumbs";
import {
  MigrationPreflightModal,
  MigrationPreflightValues,
  PreflightFixedPlan,
} from "@app/pages/applications/components/agentic-migration/migration-preflight-modal";
import { useStartMigrations } from "@app/pages/applications/components/agentic-migration/use-start-migrations";
import { useFetchApplicationMigrations } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";

/**
 * Preflight values to run a failed run again for `targets`
 * (the run's applications, or some of them): its target branch, and each
 * application's own migration plan when that is the run's plan for every
 * target; otherwise the run's plan for all.
 */
export const rerunInitialValues = (
  run: PlanRun,
  targets: Ref[],
  migrations: ApplicationMigrationMap | undefined
): Partial<MigrationPreflightValues> =>
  migrations != null &&
  targets.length > 0 &&
  targets.every(
    (application) => migrations[application.id]?.plan?.id === run.planId
  )
    ? { planSelection: "recommended", targetBranch: run.targetBranch }
    : {
        planSelection: "single",
        planId: run.planId,
        targetBranch: run.targetBranch,
      };

interface RunMigrationPlanLauncherOptions {
  /**
   * The applications to run; defaults to the applications of `rerunOf`. A
   * page whose selection changes (the inventory) passes them to `open`.
   */
  applications?: Ref[];
  /** Migration views the caller already holds (the preflight fetches them otherwise). */
  migrations?: ApplicationMigrationMap;
  /**
   * A failed run to run again: the preflight starts from its plan, branch
   * and own skill exclusions.
   */
  rerunOf?: PlanRun;
  /** The caller's breadcrumb trail, carried to the runs it starts. */
  linkCrumbs: BreadcrumbEntry[];
  /** Called once the runs are created, before the page moves to them (for example to clear a selection). */
  onStarted?: () => void;
}

/**
 * The one "Run migration plan" launcher for the plan run page,
 * the stage page, the application Migration tab, the inventory and the
 * migration plans: the preflight modal and the start, which opens the
 * created run. `open` is undefined without `agenticWorkflowRunsWriteScopes`,
 * so callers render no trigger; `open(applications)` runs those applications
 * instead of the hook's, and `open(applications, plan)` runs exactly that
 * plan on them (a plan's own Run migration plan action). Render `modal`
 * anywhere in the page. A rerun (`rerunOf`) starts from the failed run's
 * values (and its own skill exclusions, for its plan) and shows no override
 * caution while its own plan is picked.
 */
export const useRunMigrationPlanLauncher = ({
  applications,
  migrations,
  rerunOf,
  linkCrumbs,
  onStarted,
}: RunMigrationPlanLauncherOptions) => {
  const canRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  // Open with the applications given to `open`, or undefined for the hook's.
  const [opened, setOpened] = React.useState<{
    applications?: Ref[];
    plan?: PreflightFixedPlan;
  }>();
  const isOpen = opened != null;
  const { startMigrations, isStarting } = useStartMigrations(linkCrumbs, () => {
    setOpened(undefined);
    onStarted?.();
  });
  const targets =
    opened?.applications ?? applications ?? rerunOf?.applications ?? [];

  // A rerun's starting values depend on the applications' views. The query
  // is the one the preflight uses, so it is fetched once.
  const rerunViews = useFetchApplicationMigrations(
    isOpen && rerunOf != null && migrations == null
      ? targets.map((application) => application.id)
      : []
  );
  const views =
    migrations ??
    (rerunOf != null && !rerunViews.isLoading && rerunViews.fetchError == null
      ? rerunViews.migrations
      : undefined);

  return {
    open: canRun
      ? (applications?: Ref[], plan?: PreflightFixedPlan) =>
          // Also a click handler: an event is not a list of applications.
          setOpened({
            applications: Array.isArray(applications)
              ? applications
              : undefined,
            plan,
          })
      : undefined,
    modal: isOpen ? (
      <MigrationPreflightModal
        // Starting values are read once: remount when the views arrive.
        key={views == null ? "loading" : "ready"}
        applications={targets}
        migrations={views}
        initialValues={
          rerunOf != null
            ? rerunInitialValues(rerunOf, targets, views)
            : undefined
        }
        rerunPlanId={rerunOf?.planId}
        // The failed run's own exclusions apply to its plan again.
        initialExcludedSkills={
          rerunOf?.excludedSkills != null
            ? {
                [rerunOf.planId]: rerunOf.excludedSkills.map(
                  (skill) => skill.id
                ),
              }
            : undefined
        }
        plan={opened?.plan}
        isStarting={isStarting}
        onClose={() => setOpened(undefined)}
        onStartReady={startMigrations}
      />
    ) : null,
  };
};
