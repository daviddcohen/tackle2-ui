import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  Icon,
  List,
  ListItem,
  PageSection,
  Popover,
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
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ConfigurationCheck,
  MigrationPlan,
  PlanRun,
  getPlanConfigurationChecks,
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
  archetypePath,
  targetProfilePath,
} from "@app/pages/agentic/entity-paths";
import {
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlans,
  useFetchPlanRuns,
} from "@app/queries/agentic";
import { plansWriteScopes } from "@app/scopes";
import { deleteActionProps, managedActionProps } from "@app/utils/agentic";
import { openModalAfterMenuClose } from "@app/utils/utils";

import { CountLink } from "../components/count-link";

import {
  getPlanDeleteBlocker,
  useDeletePlanDialog,
} from "./components/plan-delete";
import { planApplicationsLocation, planPath } from "./components/plan-paths";
import { PlanWizard } from "./plan-wizard/plan-wizard";

type LinkTo = (pathname: string) => LocationDescriptor;

/**
 * Name with the attention marker (guide 4.1): a warning icon after the name
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

/** One target profile is its name; several are a count that opens their list (guide 4.10). */
const TargetProfilesCell: React.FC<{
  plan: MigrationPlan;
  linkTo: LinkTo;
}> = ({ plan, linkTo }) => {
  const { t } = useTranslation();
  const path = plan.migrationPath;
  if (path == null) {
    // The real adapters do not report the path yet: unknown, not empty (X6).
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (path.targetProfiles.length === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  const profileLink = (profileId: number) =>
    linkTo(targetProfilePath(path.archetype.id, profileId));
  if (path.targetProfiles.length === 1) {
    const [profile] = path.targetProfiles;
    return <Link to={profileLink(profile.id)}>{profile.name}</Link>;
  }
  return (
    <Popover
      bodyContent={
        <List isPlain>
          {path.targetProfiles.map((profile) => (
            <ListItem key={profile.id}>
              <Link to={profileLink(profile.id)}>{profile.name}</Link>
            </ListItem>
          ))}
        </List>
      }
    >
      <Button variant="link" isInline className={textStyles.textNowrap}>
        {t("agentic.plan.targetProfileCount", {
          count: path.targetProfiles.length,
        })}
      </Button>
    </Popover>
  );
};

/**
 * Runs of the plan: one run is its name (guide 4.10, C1), several are a
 * count opening the Runs tab. The single run's name needs the runs query;
 * until it answers the cell is a skeleton, and without it the count stays.
 */
const RunsCell: React.FC<{
  plan: MigrationPlan;
  runs: PlanRun[] | undefined;
  isLoadingRuns: boolean;
  linkTo: LinkTo;
}> = ({ plan, runs, isLoadingRuns, linkTo }) => {
  const { t } = useTranslation();
  const count = plan.runCount;
  if (count == null) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (count === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  if (count === 1) {
    if (isLoadingRuns) {
      return <Skeleton screenreaderText={t("terms.loading")} />;
    }
    const run = runs?.find((candidate) => candidate.planId === plan.id);
    if (run != null) {
      return (
        <Link
          to={linkTo(
            generatePath(DevPaths.planRunDetails, { runId: String(run.id) })
          )}
        >
          {run.name}
        </Link>
      );
    }
  }
  return (
    <CountLink to={linkTo(planPath(plan.id, "runs"))}>
      {t("agentic.plan.runCount", { count })}
    </CountLink>
  );
};

const MigrationPlansPage: React.FC = () => {
  const { t } = useTranslation();
  const { to, linkCrumbs } = useBreadcrumbs(t("sidebar.plans"), []);
  const canManagePlans = useHasSomeScopes(plansWriteScopes);

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
  // The marker needs both secondary queries (P6): no marker until they load.
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

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "plans",
    tableName: "migration-plans-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: migrationPlans,
    columnNames: {
      name: t("terms.name"),
      archetype: t("terms.archetype"),
      targetProfiles: t("terms.targetProfiles"),
      applications: t("terms.applications"),
      runs: t("agentic.plan.runs"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: canManagePlans,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.plan.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "archetype"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
      archetype: item?.migrationPath?.archetype.name || "",
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
                    <Th {...getThProps({ columnKey: "archetype" })} />
                    <Th {...getThProps({ columnKey: "targetProfiles" })} />
                    <Th {...getThProps({ columnKey: "applications" })} />
                    <Th {...getThProps({ columnKey: "runs" })} />
                    {canManagePlans && (
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
                        <Td {...getTdProps({ columnKey: "archetype" })}>
                          {plan.migrationPath ? (
                            <Link
                              to={to(
                                archetypePath(plan.migrationPath.archetype.id)
                              )}
                            >
                              {plan.migrationPath.archetype.name}
                            </Link>
                          ) : (
                            <EmptyTextMessage
                              message={t("agentic.common.unavailable")}
                            />
                          )}
                        </Td>
                        <Td {...getTdProps({ columnKey: "targetProfiles" })}>
                          <TargetProfilesCell plan={plan} linkTo={to} />
                        </Td>
                        <Td {...getTdProps({ columnKey: "applications" })}>
                          {plan.applicationImpact == null ? (
                            <EmptyTextMessage
                              message={t("agentic.common.unavailable")}
                            />
                          ) : plan.applicationImpact.matching === 0 ? (
                            <EmptyTextMessage message={t("terms.none")} />
                          ) : (
                            // A count even at 1 (addenda P4): the plan has no application refs.
                            <CountLink
                              to={planApplicationsLocation(plan.id, linkCrumbs)}
                            >
                              {t("agentic.plan.applicationCount", {
                                count: plan.applicationImpact.matching,
                              })}
                            </CountLink>
                          )}
                        </Td>
                        <Td {...getTdProps({ columnKey: "runs" })}>
                          <RunsCell
                            plan={plan}
                            runs={runsFetchError == null ? planRuns : undefined}
                            isLoadingRuns={isLoadingRuns}
                            linkTo={to}
                          />
                        </Td>
                        {canManagePlans && (
                          <Td isActionCell>
                            <ActionsColumn
                              items={[
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
                                    t("agentic.common.managedByKonveyor")
                                  ),
                                },
                                { isSeparator: true },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      requestDelete(plan)
                                    ),
                                  ...deleteActionProps(
                                    plan.operatorManaged
                                      ? t("agentic.common.managedByKonveyor")
                                      : getPlanDeleteBlocker(plan, t)
                                  ),
                                },
                              ]}
                            />
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
    </>
  );
};

export default MigrationPlansPage;
