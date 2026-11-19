import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from "@patternfly/react-core";

import { getMigrationDisplayStatus } from "@app/agentic";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  DetailSection,
  DetailSections,
} from "@app/pages/agentic/components/detail-section";
import { PlanRunsTable } from "@app/pages/agentic/components/plan-runs-table";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import {
  useFetchApplicationMigrations,
  useFetchPlanRuns,
} from "@app/queries/agentic";

interface PlanRunsTabProps {
  applicationId: number;
  applicationName: string;
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The plan runs that include the application: the shared
 * plan runs table under "Plan runs (n)", or a one-sentence empty section that
 * offers to run the migration plan when the application is
 * ready to start, like the Migration tab. A blocked or unconfigured
 * application says why on its Migration tab, so the offer would lead nowhere.
 */
export const PlanRunsTab: React.FC<PlanRunsTabProps> = ({
  applicationId,
  applicationName,
  linkCrumbs,
}) => {
  const { t } = useTranslation();
  const { planRuns, isLoading, fetchError } = useFetchPlanRuns();
  const runMigrationPlan = useRunMigrationPlanLauncher({
    applications: [{ id: applicationId, name: applicationName }],
    linkCrumbs,
  });

  const migrationsQuery = useFetchApplicationMigrations([applicationId]);
  // A status read earlier wins over a failed refresh. When it was never read
  // (the request failed), the dialog reads it and reports a blocked
  // application itself; a missing entry in a good answer means no plan.
  const migration = migrationsQuery.migrations[applicationId];
  const canStart =
    runMigrationPlan.open != null &&
    (migration != null
      ? getMigrationDisplayStatus(migration) === "preflightReady"
      : migrationsQuery.fetchError != null);

  const appRuns = planRuns.filter((run) =>
    run.applications.some((app) => app.id === applicationId)
  );

  // The empty section's offer depends on the status: wait for it too, so the
  // link never appears after the section has drawn.
  if (isLoading || migrationsQuery.isLoading) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  return (
    <>
      <DetailSections>
        {appRuns.length === 0 ? (
          <DetailSection title={t("agentic.applicationDetail.tabPlanRuns")}>
            <EmptyState variant="xs">
              <EmptyStateBody>
                {t("agentic.applicationDetail.planRunsEmpty")}
              </EmptyStateBody>
              {canStart && (
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button
                      variant="link"
                      onClick={() => runMigrationPlan.open?.()}
                    >
                      {t("agentic.execution.startMigration")}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              )}
            </EmptyState>
          </DetailSection>
        ) : (
          <DetailSection
            title={t("agentic.applicationDetail.planRunsTitle", {
              count: appRuns.length,
            })}
            description={t("agentic.applicationDetail.planRunsDescription")}
          >
            <PlanRunsTable
              runs={appRuns}
              linkTo={(pathname, search = "") =>
                breadcrumbTo(pathname, search, linkCrumbs)
              }
              origin={`?from=app-${applicationId}`}
              currentApplicationId={applicationId}
            />
          </DetailSection>
        )}
      </DetailSections>
      {runMigrationPlan.modal}
    </>
  );
};
