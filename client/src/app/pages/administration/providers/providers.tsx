import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  Button,
  ButtonVariant,
  Content,
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
} from "@patternfly/react-core";
import {
  ActionsColumn,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { ModelProjection, Provider } from "@app/agentic";
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
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  VerificationStatusText,
  statusPresentation,
} from "@app/pages/agentic/components/agentic-status";
import {
  useDeleteProviderMutation,
  useFetchGateways,
  useFetchProviders,
} from "@app/queries/agentic";
import { providersWriteScopes } from "@app/scopes";
import { deleteActionProps } from "@app/utils/agentic";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import {
  PROVIDER_FORM_DESCRIPTION_ID,
  PROVIDER_FORM_TITLE_ID,
  ProviderForm,
} from "./components/provider-form";

const ProvidersPage: React.FC = () => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const canManageProviders = useHasSomeScopes(providersWriteScopes);

  const { providers, isFetching, isLoading, fetchError } = useFetchProviders();
  // Usage comes from the models query: never "Not used" or an enabled Delete before it succeeded.
  const {
    gateways: models,
    isSuccess: isModelsLoaded,
    fetchError: modelsError,
  } = useFetchGateways();
  const getModels = (provider: Provider) =>
    models
      .filter((model) => model.provider.id === provider.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  const [createUpdateModalState, setCreateUpdateModalState, formKey] =
    useFormModalState<"create" | Provider>();
  const isModalOpen = createUpdateModalState !== null;
  const providerToEdit =
    createUpdateModalState !== "create" ? createUpdateModalState : null;

  const [providerToDelete, setProviderToDelete] =
    React.useState<Provider | null>(null);

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
      providerType: t("agentic.provider.type"),
      endpoint: t("agentic.provider.endpointColumn"),
      status: t("agentic.provider.status"),
      usedBy: t("agentic.provider.usedBy"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    // No actions column at all for a user who has no actions.
    hasActionsColumn: canManageProviders,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.provider.filterByName"),
        getItemValue: (item) => item.name,
      },
      {
        categoryKey: "status",
        title: t("agentic.provider.status"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.provider.filterByStatus"),
        selectOptions: Object.entries(statusPresentation.verification).map(
          ([status, { labelKey }]) => ({ value: status, label: t(labelKey) })
        ),
        matcher: (filter: string, item: Provider) =>
          item.verificationStatus === filter,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "providerType", "status"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item.name,
      providerType: t(`agentic.provider.types.${item.providerType}`),
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

  /** A provider's status does not block its models, so only the reason and what to check. */
  const getStatusText = (provider: Provider) =>
    [
      provider.statusReason,
      provider.verificationStatus === "unreachable"
        ? t("agentic.provider.unreachableEffect")
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

  /** One model is its name (models have no page); more open a popover of names. */
  const renderUsedBy = (users: ModelProjection[]) => {
    if (modelsError) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    if (!isModelsLoaded) {
      return <Skeleton screenreaderText={t("terms.loading")} />;
    }
    if (users.length === 0) {
      return <EmptyTextMessage message={t("agentic.provider.notUsed")} />;
    }
    if (users.length === 1) return users[0].name;
    return (
      <Popover
        headerContent={t("agentic.provider.usedByTitle", {
          count: users.length,
        })}
        bodyContent={
          <List isPlain>
            {users.map((model) => (
              <ListItem key={model.id}>{model.name}</ListItem>
            ))}
          </List>
        }
      >
        <Button variant="link" isInline>
          {t("agentic.provider.usedByModels", { count: users.length })}
        </Button>
      </Popover>
    );
  };

  const getDeleteBlocker = (users: ModelProjection[]) => {
    if (!isModelsLoaded) return t("agentic.common.usageUnchecked");
    if (users.length > 0) {
      return t("agentic.provider.deleteInUse", { count: users.length });
    }
    return undefined;
  };

  const closeModal = () => setCreateUpdateModalState(null);
  // The toolbar and the empty state each render their own button: an element id must stay unique.
  const renderCreateButton = (id?: string) => (
    <Button
      type="button"
      id={id}
      variant={ButtonVariant.primary}
      onClick={() => setCreateUpdateModalState("create")}
    >
      {t("agentic.provider.create")}
    </Button>
  );

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("agentic.provider.title")}
          description={
            <Content component="p">{t("agentic.provider.description")}</Content>
          }
          breadcrumbs={[]}
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isFetching && !(providers || fetchError)}
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
                {canManageProviders && (
                  <ToolbarGroup variant="action-group">
                    <ToolbarItem>
                      {renderCreateButton("create-provider")}
                    </ToolbarItem>
                  </ToolbarGroup>
                )}
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
                    <Th {...getThProps({ columnKey: "endpoint" })} width={25} />
                    <Th {...getThProps({ columnKey: "status" })} width={30} />
                    <Th
                      {...getThProps({ columnKey: "usedBy" })}
                      modifier="fitContent"
                    />
                    {canManageProviders && (
                      <Th screenReaderText={t("actions.rowActions")} />
                    )}
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
                    <NoDataEmptyState
                      title={t("agentic.provider.emptyTitle")}
                      description={
                        canManageProviders
                          ? t("agentic.provider.emptyDescription")
                          : t("agentic.provider.emptyReadOnly")
                      }
                      actions={
                        canManageProviders ? renderCreateButton() : undefined
                      }
                    />
                  )
                }
                numRenderedColumns={numRenderedColumns}
              >
                {currentPageItems.map((provider, rowIndex) => {
                  const users = getModels(provider);
                  const deleteBlocker = getDeleteBlocker(users);
                  return (
                    <Tbody key={provider.id}>
                      <Tr {...getTrProps({ item: provider })}>
                        <TableRowContentWithControls
                          {...tableControls}
                          item={provider}
                          rowIndex={rowIndex}
                        >
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "name" })}
                          >
                            {provider.name}
                          </Td>
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "providerType" })}
                          >
                            {t(
                              `agentic.provider.types.${provider.providerType}`,
                              { defaultValue: provider.providerType }
                            )}
                          </Td>
                          <Td
                            modifier="truncate"
                            tooltip={provider.endpoint}
                            {...getTdProps({ columnKey: "endpoint" })}
                          >
                            {provider.endpoint}
                          </Td>
                          <Td {...getTdProps({ columnKey: "status" })}>
                            <VerificationStatusText
                              status={provider.verificationStatus}
                              supportingText={getStatusText(provider)}
                            />
                          </Td>
                          <Td
                            modifier="nowrap"
                            {...getTdProps({ columnKey: "usedBy" })}
                          >
                            {renderUsedBy(users)}
                          </Td>
                          {canManageProviders && (
                            <Td isActionCell>
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
                                      openModalAfterMenuClose(() =>
                                        setProviderToDelete(provider)
                                      ),
                                    ...deleteActionProps(deleteBlocker),
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
        aria-labelledby={PROVIDER_FORM_TITLE_ID}
        aria-describedby={PROVIDER_FORM_DESCRIPTION_ID}
        isOpen={isModalOpen}
        onClose={closeModal}
      >
        {isModalOpen && (
          <ProviderForm
            key={formKey}
            provider={providerToEdit}
            onClose={closeModal}
          />
        )}
      </Modal>

      {providerToDelete && (
        <ConfirmDialog
          title={t("agentic.provider.deleteTitle")}
          message={t("agentic.provider.deleteBody", {
            provider: providerToDelete.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setProviderToDelete(null)}
          onClose={() => setProviderToDelete(null)}
          onConfirm={() => {
            deleteProvider(providerToDelete.id);
            setProviderToDelete(null);
          }}
        />
      )}
    </>
  );
};

export default ProvidersPage;
