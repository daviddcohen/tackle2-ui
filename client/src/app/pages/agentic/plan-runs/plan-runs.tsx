import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button, Content, PageSection } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { ControllerRunPhase, PlanRun } from "@app/agentic";
import { Archetype } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { FilterType } from "@app/components/FilterToolbar";
import { FilterCategory } from "@app/components/FilterToolbar/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { PageHeader } from "@app/components/PageHeader";
import { deserializeFilterUrlParams } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { useFetchPlanRuns } from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { agenticWorkflowRunsWriteScopes } from "@app/scopes";
import { runArchetypes } from "@app/utils/agentic";

import { statusPresentation } from "../components/agentic-status";
import { PlanRunsTable } from "../components/plan-runs-table";

import {
  planRunsArchetypeFilterKey,
  planRunsPersistenceKeyPrefix,
} from "./plan-runs-paths";

/** Status filter options: the runs that need a person first. */
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

/**
 * One option per archetype that some run touches, plus every selected one so
 * a selection always has a chip to clear (an archetype without runs, or one
 * the Hub no longer has, from a shared link): by name, `#<id>` when the Hub
 * does not know it; value = id.
 */
const archetypeFilterOptions = (
  archetypesByRun: Map<string, Archetype[]> | undefined,
  archetypes: Archetype[],
  selectedIds: string[]
) => {
  const labels = new Map<string, string>(
    [...(archetypesByRun?.values() ?? [])]
      .flat()
      .map((archetype) => [String(archetype.id), archetype.name])
  );
  for (const id of selectedIds) {
    if (!labels.has(id)) {
      labels.set(
        id,
        archetypes.find((archetype) => String(archetype.id) === id)?.name ??
          `#${id}`
      );
    }
  }
  return [...labels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

/** The archetype ids of the list's Archetype filter, from its URL state. */
const selectedArchetypeIds = (search: string): string[] => {
  const filters = deserializeFilterUrlParams<string>({
    filters: new URLSearchParams(search).get(
      `${planRunsPersistenceKeyPrefix}:filters`
    ),
  });
  const value = filters[planRunsArchetypeFilterKey];
  return Array.isArray(value) ? value.map(String) : [];
};

const PlanRunsPage: React.FC = () => {
  const { t } = useTranslation();
  // Opened from another page (starting migrations from the inventory), the
  // list keeps that trail.
  const { breadcrumbs, to } = useBreadcrumbs(t("sidebar.planRuns"), []);
  // Runs are started from the application inventory, so the empty list
  // points there; without the scope to run a plan it only says what appears.
  const canRunPlans = useHasSomeScopes(agenticWorkflowRunsWriteScopes);
  const inventoryLink = useLinkComponent(DevPaths.applications);

  const { search } = useLocation();
  const { planRuns, isFetching, isLoading, fetchError } = useFetchPlanRuns();
  // Hub membership (`archetype.applications`) relates a run to archetypes,
  // for the Archetype filter. The runs do not wait for it. A failed refresh
  // keeps the last ones: they are unavailable only when an error left no data.
  const {
    archetypes,
    isLoading: isLoadingArchetypes,
    failureCount: archetypesFailureCount,
    error: archetypesError,
  } = useFetchArchetypes();
  const archetypesUnavailable =
    archetypesError != null && archetypes.length === 0;
  const archetypesByRun = React.useMemo(
    () =>
      archetypesUnavailable
        ? undefined
        : new Map(
            planRuns.map((run) => [run.id, runArchetypes(run, archetypes)])
          ),
    [planRuns, archetypes, archetypesUnavailable]
  );
  const archetypeIds = selectedArchetypeIds(search);
  // Filtered by archetype (from the URL), the rows wait for the first
  // archetypes answer instead of showing the unfiltered list, but not
  // through its retries: after a failed attempt the filter matches nothing
  // and its chip says why the list is empty.
  const isWaitingForArchetypes =
    archetypeIds.length > 0 &&
    isLoadingArchetypes &&
    archetypesFailureCount === 0;

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
    {
      categoryKey: planRunsArchetypeFilterKey,
      title: t("terms.archetype"),
      type: FilterType.multiselect,
      placeholderText: t("agentic.planRun.filterByArchetype"),
      selectOptions: archetypeFilterOptions(
        archetypesByRun,
        archetypes,
        archetypeIds
      ),
      matcher: (filter: string, item: PlanRun) =>
        archetypesByRun
          ?.get(item.id)
          ?.some((archetype) => String(archetype.id) === filter) ?? false,
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
          breadcrumbs={breadcrumbs.length > 1 ? breadcrumbs : []}
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
              isLoading={isLoading || isWaitingForArchetypes}
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
