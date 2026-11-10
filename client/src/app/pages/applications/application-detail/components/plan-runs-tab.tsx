import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState, EmptyStateBody, Label } from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useFetchPlanRuns } from "@app/queries/agentic";

import { RunStatusLabel } from "../../../agentic/components/run-status-label";

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

  const appRuns = planRuns
    .filter((run) => run.applications.some((app) => app.id === applicationId))
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
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
    <Table
      aria-label={t("agentic.applicationDetail.tabPlanRuns")}
      variant="compact"
    >
      <Thead>
        <Tr>
          <Th width={20}>{t("terms.name")}</Th>
          <Th width={25}>{t("agentic.planRun.plan")}</Th>
          <Th width={15}>{t("agentic.planRun.status")}</Th>
          <Th width={15}>{t("agentic.planRun.targetBranch")}</Th>
          <Th width={15}>{t("agentic.planRun.started")}</Th>
          <Th width={10}>{t("agentic.planRun.completed")}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {appRuns.map((run) => (
          <Tr key={run.id}>
            <Td dataLabel={t("terms.name")}>
              <Link
                to={breadcrumbTo(
                  DevPaths.planRunDetails.replace(":runId", run.id.toString()),
                  `?from=app-${applicationId}`,
                  linkCrumbs
                )}
              >
                {run.name}
              </Link>
            </Td>
            <Td dataLabel={t("agentic.planRun.plan")}>
              <Link
                to={breadcrumbTo(
                  DevPaths.migrationPlanDetails.replace(
                    ":planId",
                    run.planId.toString()
                  ),
                  `?from=app-${applicationId}`,
                  linkCrumbs
                )}
              >
                {run.planName}
              </Link>
            </Td>
            <Td dataLabel={t("agentic.planRun.status")}>
              <RunStatusLabel status={run.status} />
            </Td>
            <Td dataLabel={t("agentic.planRun.targetBranch")}>
              <Label isCompact color="blue">
                {run.targetBranch}
              </Label>
            </Td>
            <Td dataLabel={t("agentic.planRun.started")}>
              {new Date(run.startedAt).toLocaleString()}
            </Td>
            <Td dataLabel={t("agentic.planRun.completed")}>
              {run.completedAt
                ? new Date(run.completedAt).toLocaleString()
                : "—"}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};
