import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, Content, PageSection } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { ControllerRunPhase, PlanRun } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { FilterType } from "@app/components/FilterToolbar";
import { FilterCategory } from "@app/components/FilterToolbar/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { PageHeader } from "@app/components/PageHeader";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { useFetchPlanRuns } from "@app/queries/agentic";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";

import { statusPresentation } from "../components/agentic-status";
import { PlanRunsTable } from "../components/plan-runs-table";

/** Status filter options: the runs that need a person first (guide 7.4). */
const runStatusFilterOrder: ControllerRunPhase[] = [
  "AwaitingApproval",
  "Failed",
  "Running",
  "Pending",
  "Succeeded",
];

/** One option per migration plan that has runs, by name. */
const planFilterOptions = (runs: PlanRun[]) =>
  [...new Map(runs.map((run) => [run.planId, run.planName])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

const PlanRunsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.planRuns"), []);
  // Runs are started from the application inventory, so the empty list
  // points there; without the scope to run a plan it only says what appears.
  const canRunPlans = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  const inventoryLink = useLinkComponent(DevPaths.applications);

  const { planRuns, isFetching, isLoading, fetchError } = useFetchPlanRuns();

  const filterCategories: FilterCategory<PlanRun, string>[] = [
    {
      categoryKey: "name",
      title: t("terms.name"),
      type: FilterType.search,
      placeholderText: t("agentic.planRun.filterByName"),
      getItemValue: (item) => item.name,
    },
    {
      categoryKey: "status",
      title: t("terms.status"),
      type: FilterType.multiselect,
      placeholderText: t("agentic.planRun.filterByStatus"),
      selectOptions: runStatusFilterOrder.map((status) => ({
        value: status,
        label: t(statusPresentation.run[status].labelKey),
      })),
      matcher: (filter: string, item: PlanRun) => item.status === filter,
    },
    {
      categoryKey: "plan",
      title: t("agentic.entity.migrationPlan"),
      type: FilterType.multiselect,
      placeholderText: t("agentic.planRun.filterByMigrationPlan"),
      selectOptions: planFilterOptions(planRuns),
      matcher: (filter: string, item: PlanRun) => item.planId === filter,
    },
  ];

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.planRun.title")}
          description={
            <Content component="p">{t("agentic.planRun.description")}</Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(planRuns || fetchError)}
          then={<AppPlaceholder />}
        >
          <div
            style={{
              backgroundColor:
                "var(--pf-t--global--background--color--primary--default)",
            }}
          >
            <PlanRunsTable
              runs={planRuns}
              isLoading={isLoading}
              fetchError={fetchError}
              filterCategories={filterCategories}
              emptyState={
                <NoDataEmptyState
                  title={t("agentic.planRun.emptyTitle")}
                  description={
                    canRunPlans
                      ? t("agentic.planRun.emptyDescription")
                      : t("agentic.planRun.emptyDescriptionReadOnly")
                  }
                  actions={
                    canRunPlans && (
                      <Button variant="primary" component={inventoryLink}>
                        {t("agentic.planRun.goToApplicationInventory")}
                      </Button>
                    )
                  }
                />
              }
              linkTo={to}
            />
          </div>
        </ConditionalRender>
      </PageSection>
    </>
  );
};

export default PlanRunsPage;
