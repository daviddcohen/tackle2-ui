import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useHistory } from "react-router-dom";
import {
  Alert,
  Button,
  ButtonVariant,
  Content,
  ContentVariants,
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
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { Skill, SkillCollection, SkillSourceType } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PrototypeAnnotation } from "@app/components/PrototypeAnnotation";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { OverflowActionMenu } from "@app/components/overflow-action-menu";
import { useBulkSelection } from "@app/hooks/selection";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  useDeleteSkillCollectionMutation,
  useDeleteSkillMutation,
  useFetchAgents,
  useFetchMigrationPlans,
  useFetchSkillCollections,
  useFetchSkills,
} from "@app/queries/agentic";
import { skillCollectionsWriteScopes, skillsWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { ImportSkillModal } from "./components/import-skill-modal";
import { SkillCollectionForm } from "./components/skill-collection-form";
import { SkillForm } from "./components/skill-form";
import { getSkillAssociations, getSkillDeleteBlocker } from "./skill-usage";

const sourceTypeColor: Record<SkillSourceType, "blue" | "green" | "orange"> = {
  inline: "blue",
  git: "green",
  oci: "orange",
};

type SkillOrCollection =
  | { key: string; kind: "skill"; name: string; item: Skill }
  | { key: string; kind: "collection"; name: string; item: SkillCollection };

const SkillsPage: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("agentic.skill.title"), []);
  const history = useHistory();
  const hasManageSkillsScope = useHasSomeScopes(skillsWriteScopes);
  const canManageSkills = hasManageSkillsScope;
  const { pushNotification } = React.useContext(NotificationsContext);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
    React.useState<boolean>(false);

  const [skillToDelete, setSkillToDelete] = React.useState<Skill>();
  const [skillToInspect, setSkillToInspect] = React.useState<Skill>();

  const [createUpdateModalState, setCreateUpdateModalState, skillFormKey] =
    useFormModalState<"create" | Skill>();
  const isCreateUpdateModalOpen = createUpdateModalState !== null;
  const skillToUpdate =
    createUpdateModalState !== "create" ? createUpdateModalState : null;

  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [
    createCollectionModalState,
    setCreateCollectionModalState,
    collectionFormKey,
  ] = useFormModalState<"create">();
  const [collectionInitialSkills, setCollectionInitialSkills] = React.useState<
    string[]
  >([]);

  const onDeleteSkillSuccess = () => {
    pushNotification({
      title: t("agentic.skill.deleted"),
      variant: "success",
    });
  };

  const onDeleteSkillError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: deleteSkill } = useDeleteSkillMutation(
    onDeleteSkillSuccess,
    onDeleteSkillError
  );

  const {
    skills,
    isFetching: isFetchingSkills,
    fetchError,
    refetch,
  } = useFetchSkills();
  const {
    skillCollections,
    isFetching: isFetchingCollections,
    refetch: refetchCollections,
  } = useFetchSkillCollections();
  const isFetching = isFetchingSkills || isFetchingCollections;
  const { agents } = useFetchAgents();
  const { migrationPlans } = useFetchMigrationPlans();

  const [collectionToDelete, setCollectionToDelete] =
    React.useState<SkillCollection>();
  const [isCollectionConfirmOpen, setIsCollectionConfirmOpen] =
    React.useState(false);
  const canManageCollections = useHasSomeScopes(skillCollectionsWriteScopes);

  const onDeleteCollectionSuccess = () => {
    pushNotification({
      title: t("agentic.skillCollection.deleted"),
      variant: "success",
    });
    refetchCollections();
  };
  const onDeleteCollectionError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: deleteCollection } = useDeleteSkillCollectionMutation(
    onDeleteCollectionSuccess,
    onDeleteCollectionError
  );

  const unifiedItems = React.useMemo((): SkillOrCollection[] => {
    const skillItems: SkillOrCollection[] = skills.map((s) => ({
      key: `skill-${s.id}`,
      kind: "skill",
      name: s.name,
      item: s,
    }));
    const collectionItems: SkillOrCollection[] = skillCollections.map((c) => ({
      key: `collection-${c.id}`,
      kind: "collection",
      name: c.name,
      item: c,
    }));
    return [...skillItems, ...collectionItems].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [skills, skillCollections]);

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "skills",
    tableName: "skills-table",
    idProperty: "key",
    dataNameProperty: "name",
    items: unifiedItems,
    columnNames: {
      name: t("terms.name"),
      type: t("agentic.skill.type"),
      description: t("terms.description"),
      sourceType: t("agentic.skill.sourceType"),
      associations: t("agentic.skill.associatedTo"),
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
        placeholderText: t("agentic.skill.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
      {
        categoryKey: "type",
        title: t("agentic.skill.type"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.skill.filterByType"),
        selectOptions: [
          { value: "skill", label: t("agentic.skill.typeSkill") },
          { value: "collection", label: t("agentic.skill.typeCollection") },
        ],
        matcher: (filter: string, item: SkillOrCollection) =>
          item.kind === filter,
      },
      {
        categoryKey: "sourceType",
        title: t("agentic.skill.sourceType"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.skill.filterBySourceType"),
        selectOptions: [
          { value: "inline", label: t("agentic.skill.sourceTypes.inline") },
          { value: "git", label: t("agentic.skill.sourceTypes.git") },
          { value: "oci", label: t("agentic.skill.sourceTypes.oci") },
        ],
        matcher: (filter: string, item: SkillOrCollection) =>
          item.kind === "skill" && item.item.sourceType === filter,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "type"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
      type: item?.kind || "",
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
    filteredItems,
  } = tableControls;

  // Bulk selection — skills only (collections cannot be bundled into another collection)
  const skillOnlyItems = React.useMemo(
    () =>
      unifiedItems.filter(
        (item): item is SkillOrCollection & { kind: "skill" } =>
          item.kind === "skill"
      ),
    [unifiedItems]
  );
  const currentPageSkillItems = React.useMemo(
    () =>
      currentPageItems.filter(
        (item): item is SkillOrCollection & { kind: "skill" } =>
          item.kind === "skill"
      ),
    [currentPageItems]
  );
  const filteredSkillItems = React.useMemo(
    () =>
      (filteredItems ?? []).filter(
        (item): item is SkillOrCollection & { kind: "skill" } =>
          item.kind === "skill"
      ),
    [filteredItems]
  );

  const {
    selectedItems: selectedSkillRows,
    propHelpers: { getSelectCheckboxTdProps },
  } = useBulkSelection({
    isEqual: (a, b) => a.key === b.key,
    items: skillOnlyItems,
    filteredItems: filteredSkillItems,
    currentPageItems: currentPageSkillItems,
  });

  const hasSkillSelection = selectedSkillRows.length > 0;

  const openCreateCollectionFromSelection = () => {
    setCollectionInitialSkills(selectedSkillRows.map((row) => row.item.id));
    setCreateCollectionModalState("create");
  };

  const closeCreateCollectionModal = () => {
    setCreateCollectionModalState(null);
    setCollectionInitialSkills([]);
    refetchCollections();
  };

  const getAssociations = (skill: Skill) =>
    getSkillAssociations(skill, agents, migrationPlans);

  const getSkillUsageLabel = (skill: Skill) => {
    const associations = getAssociations(skill);
    if (associations.length === 0) return t("agentic.skill.notUsed");
    const uniqueNames = associations
      .map((a) => a.scopeName)
      .filter((name, i, arr) => arr.indexOf(name) === i);
    if (uniqueNames.length <= 2) return uniqueNames.join(", ");
    return t("agentic.skill.multipleAssociations", {
      first: uniqueNames[0],
      remaining: uniqueNames.length - 1,
    });
  };

  const getDeleteDisabledReason = (skill: Skill) => {
    const blocker = getSkillDeleteBlocker(
      skill,
      agents,
      migrationPlans,
      skillCollections
    );
    if (blocker === "associations") return t("agentic.skill.deleteInUse");
    if (blocker === "collections") return t("agentic.skill.deleteInCollection");
    return undefined;
  };

  const deleteRow = (row: Skill) => {
    setSkillToDelete(row);
    setIsConfirmDialogOpen(true);
  };

  const closeCreateUpdateModal = () => {
    setCreateUpdateModalState(null);
    refetch();
  };

  // +1 for the checkbox column
  const numColumnsWithCheckbox = numRenderedColumns + 1;

  return (
    <>
      <PageSection>
        <Content component={ContentVariants.h1}>
          {t("agentic.skill.title")}
        </Content>
        <Content component={ContentVariants.p}>
          {t("agentic.skill.description")}
        </Content>
      </PageSection>
      <PageSection>
        <ConditionalRender
          when={isFetching && !(unifiedItems.length || fetchError)}
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
                  {canManageSkills && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-skill"
                        aria-label={t("agentic.skill.create")}
                        variant={ButtonVariant.primary}
                        onClick={() => setCreateUpdateModalState("create")}
                      >
                        {t("agentic.skill.create")}
                      </Button>
                    </ToolbarItem>
                  )}
                  {canManageCollections && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-skill-collection"
                        variant={ButtonVariant.secondary}
                        isDisabled={!hasSkillSelection}
                        onClick={openCreateCollectionFromSelection}
                      >
                        {hasSkillSelection
                          ? t("agentic.skill.createCollectionFromSelected", {
                              count: selectedSkillRows.length,
                            })
                          : t("agentic.skill.createCollection")}
                      </Button>
                    </ToolbarItem>
                  )}
                  {canManageSkills && (
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="import-skill"
                        variant={ButtonVariant.secondary}
                        onClick={() => setIsImportModalOpen(true)}
                      >
                        {t("agentic.skill.importFile")}
                      </Button>
                    </ToolbarItem>
                  )}
                </ToolbarGroup>
                <ToolbarItem {...paginationToolbarItemProps}>
                  <SimplePagination
                    idPrefix="skills-table"
                    isTop
                    paginationProps={paginationProps}
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
            <Table {...tableProps} aria-label={t("agentic.skill.tableLabel")}>
              <Thead>
                <Tr>
                  {/* Checkbox header — empty cell aligns with row checkboxes */}
                  <Th
                    aria-label={t("agentic.skill.selectAll")}
                    screenReaderText={t("agentic.skill.selectAll")}
                  />
                  <TableHeaderContentWithControls {...tableControls}>
                    <Th {...getThProps({ columnKey: "name" })} />
                    <Th {...getThProps({ columnKey: "type" })} />
                    <Th {...getThProps({ columnKey: "description" })} />
                    <Th {...getThProps({ columnKey: "sourceType" })} />
                    <Th {...getThProps({ columnKey: "associations" })} />
                    <Th screenReaderText={t("actions.rowActions")} />
                  </TableHeaderContentWithControls>
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isFetching}
                isError={!!fetchError}
                isNoData={currentPageItems.length === 0}
                noDataEmptyState={
                  unifiedItems.length > 0 ? (
                    <NoDataEmptyState
                      title={t("message.noResultsFoundTitle")}
                      description={t("message.noResultsFoundBody")}
                    />
                  ) : (
                    <EmptyState
                      headingLevel="h2"
                      icon={CubesIcon}
                      titleText={t("agentic.skill.emptyTitle")}
                      variant="sm"
                    >
                      <EmptyStateBody>
                        {t("agentic.skill.emptyDescription")}
                      </EmptyStateBody>
                    </EmptyState>
                  )
                }
                numRenderedColumns={numColumnsWithCheckbox}
              >
                {currentPageItems?.map((row, rowIndex) => (
                  <Tbody key={row.key} isExpanded={isCellExpanded(row)}>
                    <Tr {...getTrProps({ item: row })}>
                      {/* Checkbox cell — only rendered for skill rows */}
                      {row.kind === "skill" ? (
                        <Td
                          {...getSelectCheckboxTdProps({
                            item: row,
                            rowIndex,
                          })}
                        />
                      ) : (
                        <Td />
                      )}
                      <TableRowContentWithControls
                        {...tableControls}
                        item={row}
                        rowIndex={rowIndex}
                      >
                        <Td width={20} {...getTdProps({ columnKey: "name" })}>
                          {row.kind === "skill" ? (
                            <Link
                              to={to(
                                generatePath(DevPaths.skillDetails, {
                                  skillId: String(row.item.id),
                                })
                              )}
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <Link
                              to={to(
                                generatePath(DevPaths.skillCollectionDetails, {
                                  collectionId: String(row.item.id),
                                })
                              )}
                            >
                              {row.name}
                            </Link>
                          )}
                        </Td>
                        <Td width={10} {...getTdProps({ columnKey: "type" })}>
                          {row.kind === "skill" ? (
                            <Label color="purple" isCompact>
                              {t("agentic.skill.typeSkill")}
                            </Label>
                          ) : (
                            <Label color="teal" isCompact>
                              {t("agentic.skill.typeCollection")}
                            </Label>
                          )}
                        </Td>
                        <Td
                          width={25}
                          {...getTdProps({ columnKey: "description" })}
                        >
                          {row.item.description}
                        </Td>
                        <Td
                          width={10}
                          {...getTdProps({ columnKey: "sourceType" })}
                        >
                          {row.kind === "skill" ? (
                            <Label
                              color={sourceTypeColor[row.item.sourceType]}
                              isCompact
                            >
                              {t(
                                `agentic.skill.sourceTypes.${row.item.sourceType}`
                              )}
                            </Label>
                          ) : (
                            <Label isCompact>
                              {t("agentic.skill.collectionContents", {
                                count: row.item.skills.length,
                              })}
                            </Label>
                          )}
                        </Td>
                        <Td
                          width={20}
                          {...getTdProps({ columnKey: "associations" })}
                        >
                          {row.kind === "skill" ? (
                            <Button
                              variant={ButtonVariant.link}
                              isInline
                              onClick={() => setSkillToInspect(row.item)}
                              aria-label={t(
                                "agentic.skill.inspectAssociations",
                                {
                                  skill: row.name,
                                }
                              )}
                            >
                              {getSkillUsageLabel(row.item)}
                            </Button>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td isActionCell>
                          {row.kind === "skill" && canManageSkills && (
                            <OverflowActionMenu
                              breakpoint="lg"
                              toggleId={`skill-actions-${row.key}`}
                              toggleAriaLabel={t("actions.rowActions")}
                              items={[
                                {
                                  title: t("actions.viewDetails"),
                                  onClick: () =>
                                    history.push(
                                      to(
                                        generatePath(DevPaths.skillDetails, {
                                          skillId: String(row.item.id),
                                        })
                                      )
                                    ),
                                  itemKey: "viewDetails",
                                },
                                {
                                  title: t("actions.edit"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setCreateUpdateModalState(row.item)
                                    ),
                                  itemKey: "edit",
                                },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      deleteRow(row.item)
                                    ),
                                  itemKey: "delete",
                                  isDanger: true,
                                  isAriaDisabled:
                                    getDeleteDisabledReason(row.item) != null,
                                  tooltipProps:
                                    getDeleteDisabledReason(row.item) != null
                                      ? {
                                          content: getDeleteDisabledReason(
                                            row.item
                                          ),
                                        }
                                      : undefined,
                                },
                              ]}
                            />
                          )}
                          {row.kind === "collection" && (
                            <OverflowActionMenu
                              breakpoint="lg"
                              toggleId={`collection-actions-${row.key}`}
                              toggleAriaLabel={t("actions.rowActions")}
                              items={[
                                {
                                  title: t("actions.viewDetails"),
                                  onClick: () =>
                                    history.push(
                                      to(
                                        generatePath(
                                          DevPaths.skillCollectionDetails,
                                          {
                                            collectionId: String(row.item.id),
                                          }
                                        )
                                      )
                                    ),
                                  itemKey: "viewDetails",
                                },
                                ...(canManageCollections
                                  ? [
                                      {
                                        title: t("actions.delete"),
                                        onClick: () =>
                                          openModalAfterMenuClose(() => {
                                            setCollectionToDelete(row.item);
                                            setIsCollectionConfirmOpen(true);
                                          }),
                                        itemKey: "delete",
                                        isDanger: true,
                                      },
                                    ]
                                  : []),
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
              idPrefix="skills-table"
              isTop={false}
              paginationProps={paginationProps}
            />
          </div>
        </ConditionalRender>
      </PageSection>

      {/* Create / Edit skill */}
      <Modal
        id="create-edit-skill-modal"
        variant="medium"
        isOpen={isCreateUpdateModalOpen}
        onClose={closeCreateUpdateModal}
      >
        <ModalHeader
          title={
            skillToUpdate ? t("agentic.skill.edit") : t("agentic.skill.create")
          }
        />
        <ModalBody>
          <SkillForm
            key={skillFormKey}
            skill={skillToUpdate}
            onClose={closeCreateUpdateModal}
          />
        </ModalBody>
      </Modal>

      {/* Associations inspector */}
      <Modal
        id="skill-associations-modal"
        variant="medium"
        isOpen={skillToInspect != null}
        onClose={() => setSkillToInspect(undefined)}
      >
        <ModalHeader
          title={t("agentic.skill.associationsTitle", {
            skill: skillToInspect?.name,
          })}
        />
        <ModalBody>
          <Stack hasGutter>
            <PrototypeAnnotation>
              <StackItem>
                <Alert
                  isInline
                  variant="info"
                  title={t(
                    "agentic.prototype.annotations.skillAssociationsTitle"
                  )}
                >
                  {t(
                    "agentic.prototype.annotations.skillAssociationsDescription"
                  )}
                </Alert>
              </StackItem>
            </PrototypeAnnotation>
            {skillToInspect != null &&
              getAssociations(skillToInspect).map((association) => (
                <StackItem
                  key={`${association.scope}-${association.scopeName}`}
                >
                  <Label color="blue" isCompact>
                    {t(`agentic.plan.skillScopes.${association.scope}`)}
                  </Label>{" "}
                  {association.scopeName}
                </StackItem>
              ))}
            {skillToInspect != null &&
              getAssociations(skillToInspect).length === 0 && (
                <StackItem>{t("agentic.skill.notUsed")}</StackItem>
              )}
          </Stack>
        </ModalBody>
      </Modal>

      {/* Import skill file */}
      <ImportSkillModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Create collection (from selection) */}
      <Modal
        id="create-skill-collection-modal"
        variant="medium"
        isOpen={createCollectionModalState !== null}
        onClose={closeCreateCollectionModal}
      >
        <ModalHeader title={t("agentic.skillCollection.create")} />
        <ModalBody>
          <SkillCollectionForm
            key={collectionFormKey}
            collection={null}
            initialSkillIds={collectionInitialSkills}
            onClose={closeCreateCollectionModal}
          />
        </ModalBody>
      </Modal>

      {/* Delete skill confirm */}
      {isConfirmDialogOpen && (
        <ConfirmDialog
          title={t("agentic.skill.deleteTitle", {
            skill: skillToDelete?.name,
          })}
          titleIconVariant={"warning"}
          message={t("agentic.skill.deleteDescription")}
          isOpen={true}
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsConfirmDialogOpen(false)}
          onClose={() => setIsConfirmDialogOpen(false)}
          onConfirm={() => {
            if (skillToDelete) {
              deleteSkill(skillToDelete.id);
              setSkillToDelete(undefined);
            }
            setIsConfirmDialogOpen(false);
          }}
        />
      )}

      {/* Delete collection confirm */}
      {isCollectionConfirmOpen && (
        <ConfirmDialog
          title={t("agentic.skill.deleteCollectionTitle", {
            collection: collectionToDelete?.name,
          })}
          titleIconVariant="warning"
          message={t("agentic.skill.deleteCollectionDescription")}
          isOpen={true}
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setIsCollectionConfirmOpen(false)}
          onClose={() => setIsCollectionConfirmOpen(false)}
          onConfirm={() => {
            if (collectionToDelete) {
              deleteCollection(collectionToDelete.id);
              setCollectionToDelete(undefined);
            }
            setIsCollectionConfirmOpen(false);
          }}
        />
      )}
    </>
  );
};

export default SkillsPage;
