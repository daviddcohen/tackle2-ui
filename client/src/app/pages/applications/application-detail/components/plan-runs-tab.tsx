import * as React from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { PlanRunsTable } from "@app/pages/agentic/components/plan-runs-table";
import { useFetchPlanRuns } from "@app/queries/agentic";

interface PlanRunsTabProps {
  applicationId: number;
  linkCrumbs: BreadcrumbEntry[];
}

export const PlanRunsTab: React.FC<PlanRunsTabProps> = ({
  applicationId,
  linkCrumbs,
}) => {
  const { t } = useTranslation();
  const { planRuns, isLoading, fetchError } = useFetchPlanRuns();

  const appRuns = planRuns.filter((run) =>
    run.applications.some((app) => app.id === applicationId)
  );

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  if (appRuns.length === 0) {
    return (
      <EmptyState
        headingLevel="h3"
        icon={CubesIcon}
        titleText={t("agentic.applicationDetail.planRunsEmptyTitle")}
        variant="sm"
      >
        <EmptyStateBody>
          {t("agentic.applicationDetail.planRunsEmptyDescription")}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <PlanRunsTable
      runs={appRuns}
      linkTo={(pathname, search = "") =>
        breadcrumbTo(pathname, search, linkCrumbs)
      }
      origin={`?from=app-${applicationId}`}
      currentApplicationId={applicationId}
    />
  );
};
