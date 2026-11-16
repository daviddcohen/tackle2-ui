import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  PageSection,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

import { ControllerRunPhase, PlanRun } from "@app/agentic";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { FilterType } from "@app/components/FilterToolbar";
import { FilterCategory } from "@app/components/FilterToolbar/FilterToolbar";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFetchPlanRuns } from "@app/queries/agentic";

import { statusPresentation } from "../components/agentic-status";
import { PlanRunsTable } from "../components/plan-runs-table";

/** Status filter options, in lifecycle order. */
const runStatusFilterOrder: ControllerRunPhase[] = [
  "Pending",
  "Running",
  "AwaitingApproval",
  "Succeeded",
  "Failed",
];

const PlanRunsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.planRuns"), []);

  const { planRuns, isFetching, isLoading, fetchError } = useFetchPlanRuns();

  const filterCategories: FilterCategory<PlanRun, string>[] = [
    {
      categoryKey: "name",
      title: t("terms.name"),
      type: FilterType.search,
      placeholderText: t("agentic.agent.filterByName"),
      getItemValue: (item) => item.name,
    },
    {
      categoryKey: "status",
      title: t("agentic.planRun.status"),
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
      title: t("agentic.planRun.plan"),
      type: FilterType.search,
      placeholderText: t("agentic.planRun.filterByPlan"),
      getItemValue: (item) => item.planName,
    },
  ];

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component="h1">{t("agentic.planRun.title")}</Content>
          <Content component="p">{t("agentic.planRun.description")}</Content>
        </Content>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(planRuns.length || fetchError)}
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
                <EmptyState
                  headingLevel="h2"
                  icon={CubesIcon}
                  titleText={t("agentic.planRun.emptyTitle")}
                  variant="sm"
                >
                  <EmptyStateBody>
                    {t("agentic.planRun.emptyDescription")}
                  </EmptyStateBody>
                </EmptyState>
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
