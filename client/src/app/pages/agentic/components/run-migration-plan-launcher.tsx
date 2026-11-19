import * as React from "react";

import { ApplicationMigrationMap, PlanRun } from "@app/agentic";
import { Ref } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  MigrationPreflightModal,
  MigrationPreflightValues,
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
  /** A failed run to run again: the preflight starts from its plan and branch. */
  rerunOf?: PlanRun;
  /** The caller's breadcrumb trail, kept by links in the preflight and after starting. */
  linkCrumbs: BreadcrumbEntry[];
  /** Called once the runs are created, before the page moves to them (for example to clear a selection). */
  onStarted?: () => void;
}

/**
 * The one "Run migration plan" launcher for the plan run page,
 * the stage page, the application Migration tab and the inventory: the
 * preflight modal and the start, which opens the created run. `open` is
 * undefined without `agenticWorkflowRunsWriteScopes`, so callers render no
 * trigger; `open(applications)` runs those applications instead of the
 * hook's. Render `modal` anywhere in the page. A rerun (`rerunOf`) starts
 * from the failed run's values and shows no override caution while its own
 * plan is picked.
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
  const [opened, setOpened] = React.useState<{ applications?: Ref[] }>();
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
      ? (applications?: Ref[]) =>
          // Also a click handler: an event is not a list of applications.
          setOpened({
            applications: Array.isArray(applications)
              ? applications
              : undefined,
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
        isStarting={isStarting}
        linkTo={(pathname, search = "") =>
          breadcrumbTo(pathname, search, linkCrumbs)
        }
        onClose={() => setOpened(undefined)}
        onStartReady={startMigrations}
      />
    ) : null,
  };
};
