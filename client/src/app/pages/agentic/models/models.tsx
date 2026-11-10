import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  Button,
  ButtonVariant,
  Content,
  EmptyState,
  EmptyStateBody,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import {
  ActionsColumn,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { ModelProjection } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  useDeleteGatewayMutation,
  useFetchAgents,
  useFetchGateways,
  useSetDefaultModelMutation,
} from "@app/queries/agentic";
import { modelsWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { ModelForm } from "./components/model-form";

const ModelsPage: React.FC = () => {
  const { t } = useTranslation();
  const canManageModels = useHasSomeScopes(modelsWriteScopes);
  const { pushNotification } = React.useContext(NotificationsContext);
  const { gateways, isLoading, fetchError, refetch } = useFetchGateways();
  const { agents } = useFetchAgents();
  const [modalState, setModalState, formKey] = useFormModalState<
    "create" | ModelProjection
  >();
  const [modelToDelete, setModelToDelete] =
    React.useState<ModelProjection | null>(null);

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
      connection: t("agentic.model.connection"),
      usage: t("agentic.model.usage"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: true,
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
    sortableColumns: ["name", "provider", "model"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item.name,
      provider: item.provider.name,
      model: item.model,
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

  const getUsageCount = (model: ModelProjection) =>
    agents.filter((agent) => agent.model.id === model.id).length;

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component="h1">{t("agentic.model.title")}</Content>
          <Content component="p">{t("agentic.model.description")}</Content>
          <Content component="small">{t("agentic.model.defaultHelp")}</Content>
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ConditionalRender when={isLoading} then={<AppPlaceholder />}>
          <div
            style={{
              backgroundColor:
                "var(--pf-t--global--background--color--primary--default)",
            }}
          >
            <Toolbar {...toolbarProps}>
              <ToolbarContent>
                <FilterToolbar {...filterToolbarProps} />
                {canManageModels && (
                  <ToolbarGroup variant="action-group">
                    <ToolbarItem>
                      <Button
                        variant={ButtonVariant.primary}
                        onClick={() => setModalState("create")}
                      >
                        {t("agentic.model.create")}
                      </Button>
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
                    <Th {...getThProps({ columnKey: "provider" })} />
                    <Th {...getThProps({ columnKey: "model" })} />
                    <Th {...getThProps({ columnKey: "connection" })} />
                    <Th {...getThProps({ columnKey: "usage" })} />
                    <Th screenReaderText={t("actions.rowActions")} />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isLoading}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  gateways.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.model.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.model.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems.map((model, rowIndex) => {
                  const usageCount = getUsageCount(model);
                  return (
                    <Tbody key={model.id} isExpanded={isCellExpanded(model)}>
                      <Tr {...getTrProps({ item: model })}>
                        <TableRowContentWithControls
                          {...tableControls}
                          item={model}
                          rowIndex={rowIndex}
                        >
                          <Td width={25} {...getTdProps({ columnKey: "name" })}>
                            <Stack hasGutter>
                              <StackItem>{model.name}</StackItem>
                              {model.isOrganizationDefault && (
                                <StackItem>
                                  <Label color="blue" isCompact>
                                    {t("agentic.model.defaultModel")}
                                  </Label>
                                </StackItem>
                              )}
                            </Stack>
                          </Td>
                          <Td
                            width={20}
                            {...getTdProps({ columnKey: "provider" })}
                          >
                            {model.provider.name}
                          </Td>
                          <Td
                            width={20}
                            {...getTdProps({ columnKey: "model" })}
                          >
                            {model.model}
                          </Td>
                          <Td
                            width={20}
                            {...getTdProps({ columnKey: "connection" })}
                          >
                            <Stack>
                              <StackItem>
                                <Label
                                  color={
                                    model.verificationStatus === "verified"
                                      ? "green"
                                      : model.verificationStatus === "pending"
                                        ? "orange"
                                        : "red"
                                  }
                                  isCompact
                                >
                                  {t(
                                    `agentic.model.verificationStatuses.${model.verificationStatus}`
                                  )}
                                </Label>
                              </StackItem>
                              {model.statusReason && (
                                <StackItem>
                                  <Content component="small">
                                    {model.statusReason}
                                  </Content>
                                </StackItem>
                              )}
                            </Stack>
                          </Td>
                          <Td
                            width={15}
                            {...getTdProps({ columnKey: "usage" })}
                          >
                            {t("agentic.model.agentUsage", {
                              count: usageCount,
                            })}
                          </Td>
                          <Td isActionCell>
                            {canManageModels && (
                              <ActionsColumn
                                items={[
                                  {
                                    title: t("agentic.model.setDefault"),
                                    onClick: () => setDefault(model.id),
                                    isDisabled: model.isOrganizationDefault,
                                  },
                                  {
                                    title: t("actions.edit"),
                                    onClick: () =>
                                      openModalAfterMenuClose(() =>
                                        setModalState(model)
                                      ),
                                  },
                                  { isSeparator: true },
                                  {
                                    title: t("actions.delete"),
                                    onClick: () =>
                                      openModalAfterMenuClose(() =>
                                        setModelToDelete(model)
                                      ),
                                    isDanger: true,
                                    isAriaDisabled:
                                      usageCount > 0 ||
                                      model.isOrganizationDefault,
                                    tooltipProps: model.isOrganizationDefault
                                      ? {
                                          content: t(
                                            "agentic.model.deleteDefault"
                                          ),
                                        }
                                      : usageCount > 0
                                        ? {
                                            content: t(
                                              "agentic.model.deleteInUse"
                                            ),
                                          }
                                        : undefined,
                                  },
                                ]}
                              />
                            )}
                          </Td>
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
        isOpen={modalState != null}
        onClose={() => setModalState(null)}
      >
        <ModalHeader
          title={
            modalState === "create"
              ? t("agentic.model.create")
              : t("agentic.model.edit")
          }
        />
        <ModalBody>
          <ModelForm
            key={formKey}
            model={modalState === "create" ? null : modalState}
            onClose={() => {
              setModalState(null);
              refetch();
            }}
          />
        </ModalBody>
      </Modal>

      {modelToDelete && (
        <ConfirmDialog
          title={t("agentic.model.deleteTitle", { model: modelToDelete.name })}
          titleIconVariant="warning"
          message={t("agentic.model.deleteDescription")}
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
    </>
  );
};

export default ModelsPage;
