import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  Content,
  Flex,
  FlexItem,
  Label,
  List,
  ListItem,
  Modal,
  PageSection,
  Popover,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from "@patternfly/react-core";
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

import { AdminPaths, DevPaths } from "@app/Paths";
import { Agent, ModelProjection } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { VerificationStatusText } from "@app/pages/agentic/components/agentic-status";
import {
  useDeleteGatewayMutation,
  useFetchAgents,
  useFetchGateways,
  useFetchProviders,
  useSetDefaultModelMutation,
} from "@app/queries/agentic";
import { modelsWriteScopes } from "@app/scopes";
import { deleteActionProps, disabledActionProps } from "@app/utils/agentic";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import {
  MODEL_FORM_DESCRIPTION_ID,
  MODEL_FORM_TITLE_ID,
  ModelForm,
} from "./components/model-form";

const ModelsPage: React.FC = () => {
  const { t } = useTranslation();
  const canManageModels = useHasSomeScopes(modelsWriteScopes);
  const { pushNotification } = React.useContext(NotificationsContext);
  const { gateways, isFetching, isLoading, fetchError, refetch } =
    useFetchGateways();
  // Usage comes from the agents query: never "Not used" or an enabled Delete before it succeeded.
  const {
    agents,
    isSuccess: isAgentsLoaded,
    fetchError: agentsError,
  } = useFetchAgents();
  // Every model needs a provider: only a loaded, empty list says so.
  const {
    providers,
    isLoading: isLoadingProviders,
    fetchError: providersError,
  } = useFetchProviders();
  const hasNoProviders =
    !isLoadingProviders && !providersError && providers.length === 0;
  // An empty model list offers its next step only once that count is known.
  const isEmptyStateWaiting = gateways.length === 0 && isLoadingProviders;
  const providersLink = useLinkComponent(AdminPaths.providers);
  // Agent links from the Used by popover return here.
  const { to } = useBreadcrumbs(t("sidebar.models"), []);
  const [modalState, setModalState, formKey] = useFormModalState<
    "create" | ModelProjection
  >();
  const [modelToDelete, setModelToDelete] =
    React.useState<ModelProjection | null>(null);
  const [modelToSetDefault, setModelToSetDefault] =
    React.useState<ModelProjection | null>(null);
  const currentDefault = gateways.find((model) => model.isOrganizationDefault);

  const handleError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };
  const { mutate: deleteModel } = useDeleteGatewayMutation(() => {
    pushNotification({
      title: t("agentic.model.deleted"),
      variant: "success",
    });
  }, handleError);
  const { mutate: setDefault } = useSetDefaultModelMutation(() => {
    pushNotification({
      title: t("agentic.model.defaultUpdated"),
      variant: "success",
    });
  }, handleError);

  const tableControls = useLocalTableControls({
    tableName: "models-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: gateways,
    columnNames: {
      name: t("terms.name"),
      provider: t("agentic.model.provider"),
      model: t("agentic.model.modelId"),
      status: t("agentic.model.status"),
      usage: t("agentic.model.usage"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    // No actions column at all for a user who has no actions.
    hasActionsColumn: canManageModels,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.model.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
    ],
    initialItemsPerPage: 10,
    // Status sorts as on Model providers (same column, same behavior).
    sortableColumns: ["name", "provider", "model", "status"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item.name,
      provider: item.provider.name,
      model: item.model,
      status: item.verificationStatus,
    }),
    isLoading,
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

  const getUsers = (model: ModelProjection) =>
    agents
      .filter((agent) => agent.model.id === model.id)
      .sort((a, b) => a.name.localeCompare(b.name));

  const renderUsedBy = (users: Agent[]) => {
    if (agentsError) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    if (!isAgentsLoaded)
      return <Skeleton screenreaderText={t("terms.loading")} />;
    if (users.length === 0) {
      return <EmptyTextMessage message={t("agentic.model.notUsed")} />;
    }
    return (
      <Popover
        headerContent={t("agentic.model.usedByTitle", { count: users.length })}
        bodyContent={
          <List isPlain>
            {users.map((agent) => (
              <ListItem key={agent.id}>
                <Link
                  to={to(
                    generatePath(DevPaths.agentDetails, { agentId: agent.id })
                  )}
                >
                  {agent.name}
                </Link>
              </ListItem>
            ))}
          </List>
        }
      >
        <Button variant="link" isInline>
          {t("agentic.model.usedByAgents", { count: users.length })}
        </Button>
      </Popover>
    );
  };

  /** Why Set as default is disabled; usage does not matter here. */
  const getSetDefaultBlocker = (model: ModelProjection) => {
    if (model.isOrganizationDefault)
      return t("agentic.model.setDefaultAlready");
    if (model.verificationStatus !== "verified") {
      return t("agentic.model.setDefaultUnverified");
    }
    return undefined;
  };

  /** Why Delete is disabled: the default first, then unknown or actual usage. */
  const getDeleteBlocker = (model: ModelProjection, users: Agent[]) => {
    if (model.isOrganizationDefault) return t("agentic.model.deleteDefault");
    if (!isAgentsLoaded) return t("agentic.common.usageUnchecked");
    if (users.length > 0) {
      return t("agentic.model.deleteInUse", { count: users.length });
    }
    return undefined;
  };

  /** The server's reason, then what it means for agents or what to check. */
  const getStatusText = (model: ModelProjection) => {
    const effect =
      model.verificationStatus === "pending"
        ? t("agentic.model.pendingEffect")
        : model.verificationStatus === "unreachable"
          ? t("agentic.model.unreachableEffect")
          : undefined;
    return [model.statusReason, effect].filter(Boolean).join(" ");
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.model.title")}
          description={
            <Content component="p">{t("agentic.model.description")}</Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(gateways || fetchError)}
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
                {canManageModels && (
                  <ToolbarGroup variant="action-group">
                    <ToolbarItem>
                      {hasNoProviders ? (
                        <Tooltip
                          content={t("agentic.model.createProviderFirst")}
                        >
                          <Button
                            variant={ButtonVariant.primary}
                            isAriaDisabled
                          >
                            {t("agentic.model.create")}
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button
                          variant={ButtonVariant.primary}
                          onClick={() => setModalState("create")}
                        >
                          {t("agentic.model.create")}
                        </Button>
                      )}
                    </ToolbarItem>
                  </ToolbarGroup>
                )}
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="models-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.model.tableLabel")}>
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th
                      {...getThProps({ columnKey: "provider" })}
                      modifier="wrap"
                    />
                    <Th {...getThProps({ columnKey: "model" })} />
                    <Th {...getThProps({ columnKey: "status" })} width={30} />
                    <Th
                      {...getThProps({ columnKey: "usage" })}
                      modifier="fitContent"
                    />
                    {canManageModels && (
                      <Th screenReaderText={t("actions.rowActions")} />
                    )}
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isLoading || isEmptyStateWaiting}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  gateways.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : !canManageModels ? (
                    <NoDataEmptyState
                      title={t("agentic.model.emptyTitle")}
                      description={t("agentic.model.emptyReadOnly")}
                    />
                  ) : hasNoProviders ? (
                    <NoDataEmptyState
                      title={t("agentic.model.emptyTitle")}
                      description={t("agentic.model.emptyNoProviders")}
                      actions={
                        <Button variant="primary" component={providersLink}>
                          {t("agentic.model.goToProviders")}
                        </Button>
                      }
                    />
                  ) : (
                    <NoDataEmptyState
                      title={t("agentic.model.emptyTitle")}
                      description={t("agentic.model.emptyDescription")}
                      actions={
                        <Button
                          variant="primary"
                          onClick={() => setModalState("create")}
                        >
                          {t("agentic.model.create")}
                        </Button>
                      }
                    />
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems.map((model, rowIndex) => {
                  const users = getUsers(model);
                  const deleteBlocker = getDeleteBlocker(model, users);
                  return (
                    <Tbody key={model.id} isExpanded={isCellExpanded(model)}>
                      <Tr {...getTrProps({ item: model })}>
                        <TableRowContentWithControls
                          {...tableControls}
                          item={model}
                          rowIndex={rowIndex}
                        >
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "name" })}
                          >
                            {model.isOrganizationDefault ? (
                              <Flex
                                spaceItems={{ default: "spaceItemsSm" }}
                                alignItems={{ default: "alignItemsCenter" }}
                                flexWrap={{ default: "nowrap" }}
                              >
                                <FlexItem>{model.name}</FlexItem>
                                <FlexItem>
                                  {/* focusable so keyboard users reach the tooltip */}
                                  <Tooltip
                                    content={t("agentic.model.defaultTooltip")}
                                  >
                                    <Label
                                      variant="outline"
                                      isCompact
                                      tabIndex={0}
                                    >
                                      {t("agentic.model.defaultLabel")}
                                    </Label>
                                  </Tooltip>
                                </FlexItem>
                              </Flex>
                            ) : (
                              model.name
                            )}
                          </Td>
                          <Td {...getTdProps({ columnKey: "provider" })}>
                            {model.provider.name}
                          </Td>
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "model" })}
                          >
                            <span className={textStyles.fontFamilyMonospace}>
                              {model.model}
                            </span>
                          </Td>
                          <Td {...getTdProps({ columnKey: "status" })}>
                            <VerificationStatusText
                              status={model.verificationStatus}
                              supportingText={getStatusText(model)}
                            />
                          </Td>
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "usage" })}
                          >
                            {renderUsedBy(users)}
                          </Td>
                          {canManageModels && (
                            <Td isActionCell>
                              <ActionsColumn
                                items={[
                                  {
                                    title: t("actions.edit"),
                                    onClick: () =>
                                      openModalAfterMenuClose(() =>
                                        setModalState(model)
                                      ),
                                  },
                                  {
                                    title: t("agentic.model.setDefault"),
                                    onClick: () =>
                                      openModalAfterMenuClose(() =>
                                        setModelToSetDefault(model)
                                      ),
                                    ...disabledActionProps(
                                      getSetDefaultBlocker(model),
                                      "left",
                                      `models-table-row-${model.id}-set-default`
                                    ),
                                  },
                                  { isSeparator: true },
                                  {
                                    title: t("actions.delete"),
                                    onClick: () =>
                                      openModalAfterMenuClose(() =>
                                        setModelToDelete(model)
                                      ),
                                    ...deleteActionProps(
                                      deleteBlocker,
                                      `models-table-row-${model.id}-delete`
                                    ),
                                  },
                                ]}
                              />
                            </Td>
                          )}
                        </TableRowContentWithControls>
                      </Tr>
                    </Tbody>
                  );
                })}
              </ConditionalTableBody>
            </Table>
            <SimplePagination
              idPrefix="models-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      <Modal
        variant="medium"
        aria-labelledby={MODEL_FORM_TITLE_ID}
        aria-describedby={MODEL_FORM_DESCRIPTION_ID}
        isOpen={modalState != null}
        onClose={() => setModalState(null)}
      >
        {modalState != null && (
          <ModelForm
            key={formKey}
            model={modalState === "create" ? null : modalState}
            onClose={() => {
              setModalState(null);
              refetch();
            }}
          />
        )}
      </Modal>

      {modelToDelete && (
        <ConfirmDialog
          title={t("agentic.model.deleteTitle")}
          message={t("agentic.model.deleteBody", {
            model: modelToDelete.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setModelToDelete(null)}
          onClose={() => setModelToDelete(null)}
          onConfirm={() => {
            deleteModel(modelToDelete.id);
            setModelToDelete(null);
          }}
        />
      )}
      {modelToSetDefault && (
        <ConfirmDialog
          title={t("agentic.model.setDefaultTitle")}
          message={
            currentDefault
              ? t("agentic.model.setDefaultBody", {
                  model: modelToSetDefault.name,
                  current: currentDefault.name,
                })
              : t("agentic.model.setDefaultBodyFirst", {
                  model: modelToSetDefault.name,
                })
          }
          isOpen
          confirmBtnVariant={ButtonVariant.primary}
          confirmBtnLabel={t("agentic.model.setDefault")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setModelToSetDefault(null)}
          onClose={() => setModelToSetDefault(null)}
          onConfirm={() => {
            setDefault(modelToSetDefault.id);
            setModelToSetDefault(null);
          }}
        />
      )}
    </>
  );
};

export default ModelsPage;
