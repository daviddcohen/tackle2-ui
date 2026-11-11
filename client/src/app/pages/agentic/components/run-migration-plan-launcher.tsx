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
 * Preflight values to run a failed run again (addenda R5) for `targets`
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
  /** The applications to run; defaults to the applications of `rerunOf`. */
  applications?: Ref[];
  /** Migration views the caller already holds (the preflight fetches them otherwise). */
  migrations?: ApplicationMigrationMap;
  /** A failed run to run again: the preflight starts from its plan and branch. */
  rerunOf?: PlanRun;
  /** The caller's breadcrumb trail, kept by links in the preflight and after starting. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The one "Run migration plan" launcher (addenda R4) for the plan run page,
 * the stage page and the application Migration tab: the preflight modal and
 * the start, which opens the created run. `open` is undefined without
 * `agenticWorkflowRunsWriteScopes`, so callers render no trigger; render
 * `modal` anywhere in the page.
 */
export const useRunMigrationPlanLauncher = ({
  applications,
  migrations,
  rerunOf,
  linkCrumbs,
}: RunMigrationPlanLauncherOptions) => {
  const canRun = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  const [isOpen, setIsOpen] = React.useState(false);
  const { startMigrations, isStarting } = useStartMigrations(linkCrumbs, () =>
    setIsOpen(false)
  );
  const targets = applications ?? rerunOf?.applications ?? [];

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
    open: canRun ? () => setIsOpen(true) : undefined,
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
        isStarting={isStarting}
        linkTo={(pathname, search = "") =>
          breadcrumbTo(pathname, search, linkCrumbs)
        }
        onClose={() => setIsOpen(false)}
        onStartReady={startMigrations}
      />
    ) : null,
  };
};
