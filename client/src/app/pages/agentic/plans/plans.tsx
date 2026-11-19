import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  Icon,
  Label,
  LabelGroup,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import {
  ActionsColumn,
  IAction,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import {
  ConfigurationCheck,
  MigrationPlan,
  PlanRun,
  getPlanConfigurationChecks,
  getShownPlanRun,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { PageHeader } from "@app/components/PageHeader";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import {
  applicationDetailsPath,
  planRunPath,
} from "@app/pages/applications/components/agentic-migration/paths";
import {
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlans,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { plansWriteScopes } from "@app/scopes";
import {
  deleteActionProps,
  disabledActionProps,
  managedActionProps,
} from "@app/utils/agentic";
import { openModalAfterMenuClose, universalComparator } from "@app/utils/utils";

import { RunStatus, statusPresentation } from "../components/agentic-status";
import { CountLink } from "../components/count-link";
import { useRunMigrationPlanLauncher } from "../components/run-migration-plan-launcher";

import {
  getPlanDeleteBlocker,
  useDeletePlanDialog,
} from "./components/plan-delete";
import { planApplicationsLocation, planPath } from "./components/plan-paths";
import { getRunBlocker, preflightPlanOf } from "./components/plan-run-blocker";
import { PlanWizard } from "./plan-wizard/plan-wizard";

type LinkTo = (pathname: string) => LocationDescriptor;

/** Page-unique id of a row menu item, so its disabled reason shows on focus. */
const rowActionId = (plan: MigrationPlan, action: string) =>
  `migration-plans-table-row-${plan.id}-${action}`;

/** Archetype filter value of the plans without a migration path. */
const NOT_ASSIGNED = "notAssigned";

/**
 * Name with the attention marker: a warning icon after the name
 * whose tooltip names each failing check. The icon is joined to the name
 * with a non-breaking space so it wraps with the last word (plans residual).
 */
const PlanNameCell: React.FC<{
  plan: MigrationPlan;
  issues: ConfigurationCheck[];
  linkTo: LinkTo;
}> = ({ plan, issues, linkTo }) => {
  const { t } = useTranslation();
  const details = issues.map((check) => t(check.detailKey, check.detailValues));
  return (
    <>
      <Link to={linkTo(planPath(plan.id))}>{plan.name}</Link>
      {details.length > 0 && (
        // No break between the name and the icon: the non-breaking spaces
        // and the icon sit in one nowrap span (plans residual).
        <span className={textStyles.textNowrap}>
          {"\u00a0\u00a0"}
          <Tooltip
            position="right"
            content={
              details.length === 1 ? (
                details[0]
              ) : (
                <Stack>
                  {details.map((detail) => (
                    <StackItem key={detail}>{detail}</StackItem>
                  ))}
                </Stack>
              )
            }
          >
            <Icon status="warning" isInline aria-label={details.join(". ")}>
              <ExclamationTriangleIcon />
            </Icon>
          </Tooltip>
        </span>
      )}
    </>
  );
};

/**
 * The plan's applications in name order, two shown and "{n} more" for the
 * rest, each a link to the application. A server that only
 * counts them gets the count, which opens the filtered inventory.
 */
const ApplicationsCell: React.FC<{
  plan: MigrationPlan;
  linkTo: LinkTo;
  linkCrumbs: Parameters<typeof planApplicationsLocation>[1];
}> = ({ plan, linkTo, linkCrumbs }) => {
  const { t } = useTranslation();
  const impact = plan.applicationImpact;
  if (impact == null) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (impact.matching === 0 || impact.applications?.length === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  if (impact.applications == null) {
    return (
      <CountLink to={planApplicationsLocation(plan.id, linkCrumbs)}>
        {t("agentic.plan.applicationCount", { count: impact.matching })}
      </CountLink>
    );
  }
  return (
    <LabelGroup
      isCompact
      numLabels={2}
      aria-label={t("agentic.plan.applicationsOfPlan", { plan: plan.name })}
      collapsedText={t("agentic.plan.moreApplications", {
        count: impact.applications.length - 2,
      })}
      expandedText={t("terms.showLess")}
    >
      {impact.applications.map((application) => (
        <Label
          key={application.id}
          variant="outline"
          isCompact
          textMaxWidth="18ch"
          render={({ className, content, componentRef }) => (
            <Link
              to={linkTo(applicationDetailsPath(application.id))}
              className={className}
              ref={componentRef}
            >
              {content}
            </Link>
          )}
        >
          {application.name}
        </Label>
      ))}
    </LabelGroup>
  );
};

/**
 * The status of the plan's shown run (`getShownPlanRun`), linked to that
 * run, with "{n} runs" below when there are several. Only this cell waits
 * for the runs query.
 */
const RunsCell: React.FC<{
  plan: MigrationPlan;
  runs: PlanRun[] | undefined;
  isLoadingRuns: boolean;
  linkTo: LinkTo;
}> = ({ plan, runs, isLoadingRuns, linkTo }) => {
  const { t } = useTranslation();
  if (isLoadingRuns) {
    return <Skeleton screenreaderText={t("terms.loading")} />;
  }
  if (runs == null) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  const shown = getShownPlanRun(runs, plan.id);
  if (shown == null) {
    return <EmptyTextMessage message={t("agentic.plan.notRun")} />;
  }
  const count = runs.filter((run) => run.planId === plan.id).length;
  return (
    <RunStatus
      status={shown.status}
      to={linkTo(planRunPath(shown.id))}
      linkAriaLabel={t("agentic.plan.runStatusLabel", {
        status: t(
          statusPresentation.run[shown.status]?.labelKey ?? shown.status
        ),
        run: shown.name,
      })}
      supportingText={
        count > 1 ? t("agentic.plan.runCount", { count }) : undefined
      }
    />
  );
};

const MigrationPlansPage: React.FC = () => {
  const { t } = useTranslation();
  const { to, linkCrumbs } = useBreadcrumbs(t("sidebar.plans"), []);
  const canManagePlans = useHasSomeScopes(plansWriteScopes);
  const launcher = useRunMigrationPlanLauncher({ linkCrumbs });
  const canRunPlans = launcher.open != null;
  const hasRowActions = canManagePlans || canRunPlans;

  const { requestDelete, dialog: deleteDialog } = useDeletePlanDialog();

  const [isWizardOpen, setIsWizardOpen] = React.useState(false);
  const [planToEdit, setPlanToEdit] = React.useState<MigrationPlan | null>(
    null
  );

  const { migrationPlans, isFetching, fetchError, refetch } =
    useFetchMigrationPlans();
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsFetchError,
  } = useFetchAgents();
  const {
    gateways,
    isLoading: isLoadingModels,
    fetchError: modelsFetchError,
  } = useFetchGateways();
  const {
    planRuns,
    isLoading: isLoadingRuns,
    fetchError: runsFetchError,
  } = useFetchPlanRuns();
  // The marker needs both secondary queries: no marker until they load.
  const canCheckConfiguration =
    !isLoadingAgents &&
    !isLoadingModels &&
    agentsFetchError == null &&
    modelsFetchError == null;
  const issuesOf = (plan: MigrationPlan) =>
    canCheckConfiguration
      ? getPlanConfigurationChecks(plan, agents, gateways).filter(
          (check) => check.status === "issue"
        )
      : [];

  // The archetypes of the listed plans, by name.
  const archetypeOptions = [
    ...new Map(
      migrationPlans.flatMap((plan) =>
        plan.migrationPath != null
          ? [[plan.migrationPath.archetype.id, plan.migrationPath.archetype]]
          : []
      )
    ).values(),
  ]
    .sort((a, b) => universalComparator(a.name, b.name))
    .map((archetype) => ({
      value: String(archetype.id),
      label: archetype.name,
    }));

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "plans",
    tableName: "migration-plans-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: migrationPlans,
    columnNames: {
      name: t("terms.name"),
      applications: t("terms.applications"),
      runs: t("agentic.plan.runs"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: hasRowActions,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.plan.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
      {
        categoryKey: "archetype",
        title: t("terms.archetype"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.plan.filterByArchetype"),
        selectOptions: [
          ...archetypeOptions,
          { value: NOT_ASSIGNED, label: t("agentic.execution.notAssigned") },
        ],
        matcher: (filter: string, item: MigrationPlan) =>
          filter === NOT_ASSIGNED
            ? item.migrationPath == null
            : String(item.migrationPath?.archetype.id) === filter,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
    }),
    isLoading: isFetching,
  });

  const {
    currentPageItems,
    numRenderedColumns,
    propHelpers: {
      toolbarProps,
      filterToolbarProps,
      paginationToolbarItemProps,
      paginationProps,
      tableProps,
      getThProps,
      getTrProps,
      getTdProps,
    },
    expansionDerivedState: { isCellExpanded },
  } = tableControls;

  // Edit, Run migration plan, a separator and Delete; each only with its scope.
  const rowActions = (plan: MigrationPlan): IAction[] => [
    ...(canManagePlans
      ? [
          {
            title: t("actions.edit"),
            onClick: () => {
              openModalAfterMenuClose(() => {
                setPlanToEdit(plan);
                setIsWizardOpen(true);
              });
            },
            ...managedActionProps(
              plan.operatorManaged,
              t("agentic.common.managedByKonveyor"),
              undefined,
              rowActionId(plan, "edit")
            ),
          },
        ]
      : []),
    ...(launcher.open != null
      ? [
          {
            title: t("agentic.execution.startMigration"),
            onClick: () =>
              openModalAfterMenuClose(() =>
                launcher.open?.(
                  plan.applicationImpact?.applications ?? [],
                  preflightPlanOf(plan)
                )
              ),
            ...disabledActionProps(
              getRunBlocker(plan, canManagePlans, t),
              "left",
              rowActionId(plan, "run")
            ),
          },
        ]
      : []),
    ...(canManagePlans
      ? [
          { isSeparator: true },
          {
            title: t("actions.delete"),
            onClick: () => openModalAfterMenuClose(() => requestDelete(plan)),
            ...deleteActionProps(
              plan.operatorManaged
                ? t("agentic.common.managedByKonveyor")
                : getPlanDeleteBlocker(plan, t),
              rowActionId(plan, "delete")
            ),
          },
        ]
      : []),
  ];

  const closeWizard = () => {
    setIsWizardOpen(false);
    setPlanToEdit(null);
    refetch();
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.plan.plansTitle")}
          description={
            <Content component="p">
              {t("agentic.plan.plansDescription")}
            </Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(migrationPlans || fetchError)}
          then={<AppPlaceholder />}
        >
          <div
            style={{
              backgroundColor:
                "var(--pf-t--global--background--color--primary--default)",
            }}
          >
            <Toolbar {...toolbarProps}>
              <ToolbarContent>
                <FilterToolbar {...filterToolbarProps} breakpoint="lg" />
                <ToolbarGroup variant="action-group">
                  {canManagePlans && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-migration-plan"
                        variant={ButtonVariant.primary}
                        onClick={() => {
                          setPlanToEdit(null);
                          setIsWizardOpen(true);
                        }}
                      >
                        {t("agentic.plan.createTitle")}
                      </Button>
                    </ToolbarItem>
                  )}
                </ToolbarGroup>
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="migration-plans-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.plan.tableLabel")}>
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th
                      {...getThProps({ columnKey: "applications" })}
                      info={{
                        popover: t("agentic.plan.applicationsHelp"),
                        ariaLabel: t("agentic.plan.applicationsHelpLabel"),
                        popoverProps: {
                          closeBtnAriaLabel: t("actions.close"),
                          "aria-label": t("agentic.plan.applicationsHelpLabel"),
                        },
                      }}
                    />
                    <Th
                      {...getThProps({ columnKey: "runs" })}
                      modifier="fitContent"
                    />
                    {hasRowActions && (
                      <Th screenReaderText={t("actions.rowActions")} />
                    )}
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isFetching}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  migrationPlans.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <NoDataEmptyState
                      title={t("agentic.plan.emptyTitle")}
                      description={
                        canManagePlans
                          ? t("agentic.plan.emptyDescription")
                          : t("agentic.plan.emptyDescriptionReadOnly")
                      }
                      actions={
                        canManagePlans ? (
                          <Button
                            variant={ButtonVariant.primary}
                            onClick={() => {
                              setPlanToEdit(null);
                              setIsWizardOpen(true);
                            }}
                          >
                            {t("agentic.plan.createTitle")}
                          </Button>
                        ) : undefined
                      }
                    />
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems?.map((plan, rowIndex) => (
                  <Tbody key={plan.id} isExpanded={isCellExpanded(plan)}>
                    <Tr {...getTrProps({ item: plan })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={plan}
                        rowIndex={rowIndex}
                      >
                        <Td {...getTdProps({ columnKey: "name" })}>
                          <PlanNameCell
                            plan={plan}
                            issues={issuesOf(plan)}
                            linkTo={to}
                          />
                        </Td>
                        {/* The width sits on the cells: on a Th with info, PF
                            also applies it to the header text, which truncates. */}
                        <Td
                          {...getTdProps({ columnKey: "applications" })}
                          width={45}
                        >
                          <ApplicationsCell
                            plan={plan}
                            linkTo={to}
                            linkCrumbs={linkCrumbs}
                          />
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "runs" })}
                          modifier="nowrap"
                        >
                          <RunsCell
                            plan={plan}
                            runs={runsFetchError == null ? planRuns : undefined}
                            isLoadingRuns={isLoadingRuns}
                            linkTo={to}
                          />
                        </Td>
                        {hasRowActions && (
                          <Td isActionCell>
                            <ActionsColumn items={rowActions(plan)} />
                          </Td>
                        )}
                      </TableRowContentWithControls>
                    </Tr>
                  </Tbody>
                ))}
              </ConditionalTableBody>
            </Table>
            <SimplePagination
              idPrefix="migration-plans-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      <PlanWizard
        isOpen={isWizardOpen}
        plan={planToEdit}
        onClose={closeWizard}
      />

      {deleteDialog}
      {launcher.modal}
    </>
  );
};

export default MigrationPlansPage;
