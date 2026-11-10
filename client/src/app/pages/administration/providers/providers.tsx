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

import { Provider } from "@app/agentic";
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
  useDeleteProviderMutation,
  useFetchGateways,
  useFetchProviders,
} from "@app/queries/agentic";
import { providersWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { ProviderForm } from "./components/provider-form";

const verificationColor = (
  status: Provider["verificationStatus"]
): "green" | "red" | "grey" => {
  if (status === "verified") return "green";
  if (status === "unreachable") return "red";
  return "grey";
};

const ProvidersPage: React.FC = () => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageProviders = useHasSomeScopes(providersWriteScopes);

  const { providers, isFetching, isLoading, fetchError } = useFetchProviders();
  const { gateways: models } = useFetchGateways();
  const getModelCount = (provider: Provider) =>
    models.filter((model) => model.provider.id === provider.id).length;
  const [createUpdateModalState, setCreateUpdateModalState, formKey] =
    useFormModalState<"create" | Provider>();
  const isModalOpen = createUpdateModalState !== null;
  const providerToEdit =
    createUpdateModalState !== "create" ? createUpdateModalState : null;

  const [providerToDelete, setProviderToDelete] = React.useState<Provider>();
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const { mutate: deleteProvider } = useDeleteProviderMutation(
    () =>
      pushNotification({
        title: t("agentic.provider.deleted"),
        variant: "success",
      }),
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  const tableControls = useLocalTableControls({
    tableName: "providers-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: providers,
    columnNames: {
      name: t("terms.name"),
      providerType: t("agentic.provider.providerType"),
      endpoint: t("agentic.provider.endpoint"),
      status: t("agentic.provider.verificationStatus"),
      lastVerified: t("agentic.provider.lastVerified"),
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
        placeholderText: t("agentic.agent.filterByName"),
        getItemValue: (item) => item.name,
      },
      {
        categoryKey: "status",
        title: t("agentic.provider.verificationStatus"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.provider.filterByStatus"),
        selectOptions: [
          {
            value: "verified",
            label: t("agentic.model.verificationStatuses.verified"),
          },
          {
            value: "pending",
            label: t("agentic.model.verificationStatuses.pending"),
          },
          {
            value: "unreachable",
            label: t("agentic.model.verificationStatuses.unreachable"),
          },
        ],
        matcher: (filter: string, item: Provider) =>
          item.verificationStatus === filter,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "providerType", "status"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item.name,
      providerType: item.providerType,
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
  } = tableControls;

  const closeModal = () => setCreateUpdateModalState(null);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component="h1">{t("agentic.provider.title")}</Content>
          <Content component="p">{t("agentic.provider.description")}</Content>
        </Content>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(providers.length || fetchError)}
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
                <FilterToolbar {...filterToolbarProps} />
                <ToolbarGroup variant="action-group">
                  {canManageProviders && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-provider"
                        variant={ButtonVariant.primary}
                        onClick={() => setCreateUpdateModalState("create")}
                      >
                        {t("agentic.provider.create")}
                      </Button>
                    </ToolbarItem>
                  )}
                </ToolbarGroup>
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="providers-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table
              {...tableProps}
              aria-label={t("agentic.provider.tableLabel")}
            >
              <Thead>
                <Tr>
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th {...getThProps({ columnKey: "providerType" })} />
                    <Th {...getThProps({ columnKey: "endpoint" })} />
                    <Th {...getThProps({ columnKey: "status" })} />
                    <Th {...getThProps({ columnKey: "lastVerified" })} />
                    <Th screenReaderText={t("actions.rowActions")} />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isLoading}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  providers.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.provider.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.provider.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems.map((provider, rowIndex) => (
                  <Tbody key={provider.id}>
                    <Tr {...getTrProps({ item: provider })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={provider}
                        rowIndex={rowIndex}
                      >
                        <Td width={20} {...getTdProps({ columnKey: "name" })}>
                          {provider.name}
                        </Td>
                        <Td
                          width={15}
                          {...getTdProps({ columnKey: "providerType" })}
                        >
                          {t(
                            `agentic.provider.types.${provider.providerType}`,
                            {
                              defaultValue: provider.providerType,
                            }
                          )}
                        </Td>
                        <Td
                          width={25}
                          {...getTdProps({ columnKey: "endpoint" })}
                        >
                          <Content component="small">
                            {provider.endpoint}
                          </Content>
                        </Td>
                        <Td width={15} {...getTdProps({ columnKey: "status" })}>
                          <Label
                            color={verificationColor(
                              provider.verificationStatus
                            )}
                            isCompact
                          >
                            {t(
                              `agentic.model.verificationStatuses.${provider.verificationStatus}`,
                              { defaultValue: provider.verificationStatus }
                            )}
                          </Label>
                          {provider.statusReason && (
                            <Content component="small">
                              {" — "}
                              {provider.statusReason}
                            </Content>
                          )}
                        </Td>
                        <Td
                          width={15}
                          {...getTdProps({ columnKey: "lastVerified" })}
                        >
                          {provider.lastVerified
                            ? new Date(provider.lastVerified).toLocaleString()
                            : "—"}
                        </Td>
                        <Td isActionCell>
                          {canManageProviders && (
                            <ActionsColumn
                              items={[
                                {
                                  title: t("actions.edit"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setCreateUpdateModalState(provider)
                                    ),
                                },
                                { isSeparator: true },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() => {
                                      setProviderToDelete(provider);
                                      setIsDeleteOpen(true);
                                    }),
                                  isDanger: true,
                                  isAriaDisabled: getModelCount(provider) > 0,
                                  tooltipProps:
                                    getModelCount(provider) > 0
                                      ? {
                                          content: t(
                                            "agentic.provider.deleteInUse",
                                            { count: getModelCount(provider) }
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
                ))}
              </ConditionalTableBody>
            </Table>
            <SimplePagination
              idPrefix="providers-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      <Modal
        id="create-edit-provider-modal"
        variant="medium"
        isOpen={isModalOpen}
        onClose={closeModal}
      >
        <ModalHeader
          title={
            providerToEdit
              ? t("agentic.provider.edit")
              : t("agentic.provider.createTitle")
          }
        />
        <ModalBody>
          <ProviderForm
            key={formKey}
            provider={providerToEdit}
            onClose={closeModal}
          />
        </ModalBody>
      </Modal>

      {isDeleteOpen && (
        <ConfirmDialog
          title={t("agentic.provider.deleteTitle", {
            provider: providerToDelete?.name,
          })}
          titleIconVariant="warning"
          message={t("agentic.provider.deleteDescription")}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsDeleteOpen(false)}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() => {
            if (providerToDelete) {
              deleteProvider(providerToDelete.id);
              setProviderToDelete(undefined);
            }
            setIsDeleteOpen(false);
          }}
        />
      )}
    </>
  );
};

export default ProvidersPage;
