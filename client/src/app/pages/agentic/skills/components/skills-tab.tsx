import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  ButtonVariant,
  DropdownItem,
  Flex,
  FlexItem,
  Label,
  PageSection,
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

import { DevPaths } from "@app/Paths";
import { Skill, SkillSourceType } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterToolbar, FilterType } from "@app/components/FilterToolbar";
import { KebabDropdown } from "@app/components/KebabDropdown";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { SimplePagination } from "@app/components/SimplePagination";
import {
  ConditionalTableBody,
  TableHeaderContentWithControls,
  TableRowContentWithControls,
} from "@app/components/TableControls";
import { useLocalTableControls } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFormModalState } from "@app/hooks/useFormModalState";
import {
  useDeleteSkillMutation,
  useFetchSkillCollections,
  useFetchSkills,
} from "@app/queries/agentic";
import { skillsWriteScopes } from "@app/scopes";
import { deleteActionProps, managedActionProps } from "@app/utils/agentic";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import { CountLink } from "../../components/count-link";
import {
  getCollectionsContainingSkill,
  getSkillDeleteBlockedReason,
  getSkillUsageParts,
} from "../skill-usage";

import { ImportSkillModal } from "./import-skill-modal";
import { SkillModal } from "./skill-form";

const SOURCE_TYPES: SkillSourceType[] = ["inline", "git", "oci"];

/** The Skills tab of the Skills page. */
export const SkillsTab: React.FC = () => {
  const { t } = useTranslation();
  const { to } = useBreadcrumbs(t("sidebar.skills"), []);
  const canManageSkills = useHasSomeScopes(skillsWriteScopes);
  const { pushNotification } = React.useContext(NotificationsContext);

  const { skills, isFetching, fetchError, refetch } = useFetchSkills();
  const {
    skillCollections,
    isLoading: isLoadingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  // Memberships block a delete; unknown until the collections have loaded.
  const knownCollections =
    isLoadingCollections || collectionsError != null
      ? undefined
      : skillCollections;

  const [formModalState, setFormModalState] = useFormModalState<
    "create" | Skill
  >();
  const skillToUpdate = formModalState !== "create" ? formModalState : null;
  const closeFormModal = () => {
    setFormModalState(null);
    refetch();
  };
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [skillToDelete, setSkillToDelete] = React.useState<Skill>();

  const { mutate: deleteSkill } = useDeleteSkillMutation(
    () =>
      pushNotification({
        title: t("agentic.skill.deleted"),
        variant: "success",
      }),
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  const sourceLabel = (sourceType: SkillSourceType) =>
    t(`agentic.skill.sourceTypes.${sourceType}`);

  const tableControls = useLocalTableControls({
    persistTo: "urlParams",
    persistenceKeyPrefix: "skills",
    tableName: "skills-table",
    idProperty: "id",
    dataNameProperty: "name",
    items: skills,
    columnNames: {
      name: t("terms.name"),
      description: t("terms.description"),
      source: t("terms.source"),
      usage: t("agentic.skill.usage"),
    },
    isFilterEnabled: true,
    isSortEnabled: true,
    isPaginationEnabled: true,
    hasActionsColumn: canManageSkills,
    filterCategories: [
      {
        categoryKey: "name",
        title: t("terms.name"),
        type: FilterType.search,
        placeholderText: t("agentic.skill.filterByName"),
        getItemValue: (item) => item?.name || "",
      },
      {
        categoryKey: "source",
        title: t("terms.source"),
        type: FilterType.multiselect,
        placeholderText: t("agentic.skill.filterBySourceType"),
        selectOptions: SOURCE_TYPES.map((value) => ({
          value,
          label: sourceLabel(value),
        })),
        matcher: (filter: string, item: Skill) => item.sourceType === filter,
      },
    ],
    initialItemsPerPage: 10,
    sortableColumns: ["name", "source"],
    initialSort: { columnKey: "name", direction: "asc" },
    getSortValues: (item) => ({
      name: item?.name || "",
      source: sourceLabel(item.sourceType),
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
  } = tableControls;

  const createButton = (
    <Button
      type="button"
      id="create-skill"
      variant={ButtonVariant.primary}
      onClick={() => setFormModalState("create")}
    >
      {t("agentic.skill.create")}
    </Button>
  );

  const managedTooltip = t("agentic.common.managedByKonveyor");

  return (
    <PageSection hasBodyWrapper={false}>
      <ConditionalRender
        when={isFetching && !(skills || fetchError)}
        then={<AppPlaceholder />}
      >
        {/* The list wrapper of archetypes-page.tsx, kept for parity:
            inside the PageSection, so the toolbar, table and
            pagination do not get the section's row gap. */}
        <div
          style={{
            backgroundColor:
              "var(--pf-t--global--background--color--primary--default)",
          }}
        >
          <Toolbar {...toolbarProps}>
            <ToolbarContent>
              {/* Filters stay expanded down to 1024 wide. */}
              <FilterToolbar {...filterToolbarProps} breakpoint="lg" />
              {canManageSkills && (
                <ToolbarGroup variant="action-group">
                  <ToolbarItem>{createButton}</ToolbarItem>
                  <ToolbarItem>
                    <KebabDropdown
                      ariaLabel={t("agentic.skill.toolbarActions")}
                      dropdownItems={[
                        <DropdownItem
                          key="import-skill"
                          id="import-skill"
                          onClick={() => setIsImportModalOpen(true)}
                        >
                          {t("agentic.skill.importFile")}
                        </DropdownItem>,
                      ]}
                    />
                  </ToolbarItem>
                </ToolbarGroup>
              )}
              <ToolbarItem {...paginationToolbarItemProps}>
                <SimplePagination
                  idPrefix="skills-table"
                  isTop
                  paginationProps={paginationProps}
                />
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          <Table {...tableProps} aria-label={t("agentic.skill.title")}>
            <Thead>
              <Tr>
                <TableHeaderContentWithControls {...tableControls}>
                  <Th {...getThProps({ columnKey: "name" })} width={20} />
                  <Th
                    {...getThProps({ columnKey: "description" })}
                    width={30}
                  />
                  <Th
                    {...getThProps({ columnKey: "source" })}
                    modifier="fitContent"
                  />
                  {/* Not sortable: it counts several kinds of things. */}
                  <Th {...getThProps({ columnKey: "usage" })} />
                </TableHeaderContentWithControls>
              </Tr>
            </Thead>
            <ConditionalTableBody
              isLoading={isFetching}
              isError={!!fetchError}
              isNoData={currentPageItems.length === 0}
              noDataEmptyState={
                skills.length > 0 ? (
                  <NoDataEmptyState
                    title={t("message.noResultsFoundTitle")}
                    description={t("message.noResultsFoundBody")}
                  />
                ) : (
                  <NoDataEmptyState
                    title={t("agentic.skill.emptyTitle")}
                    description={
                      canManageSkills
                        ? t("agentic.skill.emptyDescription")
                        : t("agentic.skill.emptyDescriptionReadOnly")
                    }
                    actions={
                      canManageSkills && (
                        <>
                          {createButton}
                          <Button
                            variant={ButtonVariant.link}
                            onClick={() => setIsImportModalOpen(true)}
                          >
                            {t("agentic.skill.importFile")}
                          </Button>
                        </>
                      )
                    }
                  />
                )
              }
              numRenderedColumns={numRenderedColumns}
            >
              <Tbody>
                {currentPageItems.map((skill, rowIndex) => {
                  const usageParts = getSkillUsageParts(
                    t,
                    skill,
                    knownCollections &&
                      getCollectionsContainingSkill(skill, knownCollections)
                        .length
                  );
                  const deleteBlockedReason = getSkillDeleteBlockedReason(
                    t,
                    skill,
                    knownCollections
                  );
                  return (
                    <Tr key={skill.id} {...getTrProps({ item: skill })}>
                      <TableRowContentWithControls
                        {...tableControls}
                        item={skill}
                        rowIndex={rowIndex}
                      >
                        <Td {...getTdProps({ columnKey: "name" })}>
                          <Flex
                            spaceItems={{ default: "spaceItemsSm" }}
                            alignItems={{ default: "alignItemsCenter" }}
                          >
                            <FlexItem>
                              <Link
                                to={to(
                                  generatePath(DevPaths.skillDetails, {
                                    skillId: String(skill.id),
                                  })
                                )}
                              >
                                {skill.name}
                              </Link>
                            </FlexItem>
                            {skill.loadPolicy === "rule" && (
                              <FlexItem>
                                <Label variant="outline" isCompact>
                                  {t("agentic.skill.loadPolicy.rule")}
                                </Label>
                              </FlexItem>
                            )}
                          </Flex>
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "description" })}
                          modifier="truncate"
                          tooltip={skill.description}
                        >
                          {skill.description}
                        </Td>
                        <Td
                          {...getTdProps({ columnKey: "source" })}
                          modifier="nowrap"
                        >
                          {sourceLabel(skill.sourceType)}
                        </Td>
                        <Td {...getTdProps({ columnKey: "usage" })}>
                          {usageParts == null ? (
                            <EmptyTextMessage
                              message={t("agentic.common.unavailable")}
                            />
                          ) : usageParts.length === 0 &&
                            isLoadingCollections ? (
                            <Skeleton
                              width="6rem"
                              screenreaderText={t("terms.loading")}
                            />
                          ) : usageParts.length === 0 ? (
                            // Not "None" while the collections are unknown.
                            <EmptyTextMessage
                              message={
                                knownCollections == null
                                  ? t("agentic.common.unavailable")
                                  : t("terms.none")
                              }
                            />
                          ) : (
                            <CountLink
                              to={to(
                                generatePath(DevPaths.skillDetails, {
                                  skillId: String(skill.id),
                                }),
                                "?tab=usage"
                              )}
                            >
                              {usageParts.join(", ")}
                            </CountLink>
                          )}
                        </Td>
                        {canManageSkills && (
                          <Td isActionCell>
                            <ActionsColumn
                              items={[
                                {
                                  title: t("actions.edit"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setFormModalState(skill)
                                    ),
                                  ...managedActionProps(
                                    skill.operatorManaged,
                                    managedTooltip,
                                    undefined,
                                    `skills-table-row-${skill.id}-edit`
                                  ),
                                },
                                { isSeparator: true },
                                {
                                  title: t("actions.delete"),
                                  onClick: () =>
                                    openModalAfterMenuClose(() =>
                                      setSkillToDelete(skill)
                                    ),
                                  ...deleteActionProps(
                                    skill.operatorManaged
                                      ? managedTooltip
                                      : deleteBlockedReason,
                                    `skills-table-row-${skill.id}-delete`
                                  ),
                                },
                              ]}
                            />
                          </Td>
                        )}
                      </TableRowContentWithControls>
                    </Tr>
                  );
                })}
              </Tbody>
            </ConditionalTableBody>
          </Table>
          <SimplePagination
            idPrefix="skills-table"
            isTop={false}
            paginationProps={paginationProps}
          />
        </div>
      </ConditionalRender>

      <SkillModal
        isOpen={formModalState !== null}
        skill={skillToUpdate}
        onClose={closeFormModal}
      />

      <ImportSkillModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {skillToDelete != null && (
        <ConfirmDialog
          title={t("agentic.skill.deleteTitle")}
          message={t("agentic.skill.deleteDescription", {
            name: skillToDelete.name,
          })}
          isOpen
          confirmBtnVariant={ButtonVariant.danger}
          confirmBtnLabel={t("actions.delete")}
          cancelBtnLabel={t("actions.cancel")}
          onCancel={() => setSkillToDelete(undefined)}
          onClose={() => setSkillToDelete(undefined)}
          onConfirm={() => {
            deleteSkill(skillToDelete.id);
            setSkillToDelete(undefined);
          }}
        />
      )}
    </PageSection>
  );
};
