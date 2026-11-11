import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
} from "@patternfly/react-core";

import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { PlanRunsTable } from "@app/pages/agentic/components/plan-runs-table";
import { useRunMigrationPlanLauncher } from "@app/pages/agentic/components/run-migration-plan-launcher";
import { useFetchPlanRuns } from "@app/queries/agentic";

import { TabSection, TabSections } from "./tab-sections";

interface PlanRunsTabProps {
  applicationId: number;
  applicationName: string;
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The plan runs that include the application (guide 7.6, C3): the shared
 * plan runs table under "Plan runs (n)", or a one-sentence empty section that
 * offers to run the migration plan (applications AP5).
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

  const appRuns = planRuns.filter((run) =>
    run.applications.some((app) => app.id === applicationId)
  );

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  return (
    <>
      <TabSections>
        {appRuns.length === 0 ? (
          <TabSection title={t("agentic.applicationDetail.tabPlanRuns")}>
            <EmptyState variant="xs">
              <EmptyStateBody>
                {t("agentic.applicationDetail.planRunsEmpty")}
              </EmptyStateBody>
              {runMigrationPlan.open != null && (
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
          </TabSection>
        ) : (
          <TabSection
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
          </TabSection>
        )}
      </TabSections>
      {runMigrationPlan.modal}
    </>
  );
};
