import { useState } from "react";
import * as React from "react";
import { isAxiosError } from "axios";
import { createPath, parsePath } from "history";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  ButtonVariant,
  Content,
  PageSection,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
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
  DEFAULT_REFETCH_INTERVAL,
  TablePersistenceKeyPrefix,
  isAgenticEnabled,
} from "@app/Constants";
import { ArchetypeTargetProfilesRoute, DevPaths } from "@app/Paths";
import type { TargetProfile } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { NoDataEmptyState } from "@app/components/NoDataEmptyState";
import { PageHeader } from "@app/components/PageHeader";
import { ConditionalTableBody } from "@app/components/TableControls";
import { LabelsFromItems } from "@app/components/labels/labels-from-items/labels-from-items";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import {
  ManageSkillsModal,
  ManageSkillsTarget,
  useCanManageSkills,
} from "@app/pages/agentic/components/manage-skills-modal";
import { EntityDetailUnavailable } from "@app/pages/agentic/entity-detail";
import { archetypePath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";
import { useFetchArchetypeById } from "@app/queries/archetypes";
import { archetypesWriteScopes, plansWriteScopes } from "@app/scopes";
import { deleteActionProps, disabledActionProps } from "@app/utils/agentic";
import { openModalAfterMenuClose } from "@app/utils/utils";

import { AssignAnalysisProfileModal } from "./components/assign-analysis-profile-modal";
import { AssignMigrationPlanModal } from "./components/assign-migration-plan-modal";
import { AssignedMigrationPlan } from "./components/assigned-migration-plan";
import { ManageGeneratorsModal } from "./components/manage-generators-modal";
import {
  CreateTargetProfileModal,
  EditTargetProfileModal,
} from "./components/target-profile-form";
import { TargetProfileSkills } from "./components/target-profile-skills";
import { useArchetypeMutations } from "./hooks/useArchetypeMutations";
import { useTargetProfilePlans } from "./hooks/useTargetProfilePlans";

/** The modals a row's actions open, each for one target profile. */
type RowModal = {
  action: "edit" | "generators" | "analysisProfile" | "plan" | "delete";
  profile: TargetProfile;
};

const CREATE_BUTTON_ID = "create-target-profile";
const EMPTY_STATE_CREATE_BUTTON_ID = "create-target-profile-empty-state";

const rowActionsCellId = (profileId: number) =>
  `target-profile-${profileId}-actions`;

/**
 * Remembers the row whose action opened a modal and puts focus back on that
 * row's kebab when the modal closes (Save, Cancel or Escape). The menu item
 * that opened it is gone, and `openModalAfterMenuClose` blurs the kebab
 * before the modal opens, so the modal has nowhere to return focus to.
 * After a delete the row goes too, so focus goes to the Create target
 * profile button in the toolbar, which stays (deleting needs the same scope
 * as creating), also when no rows remain. It is also where focus goes when
 * the row went while its modal was open (deleted elsewhere).
 */
const useRowModal = () => {
  const [rowModal, setRowModal] = useState<RowModal | null>(null);
  const focusOnClose = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (rowModal != null) return;
    const selector = focusOnClose.current;
    focusOnClose.current = null;
    if (selector == null) return;
    // After the modal's own focus handling, which returns to the body.
    const frame = window.requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(selector) ??
        document.getElementById(CREATE_BUTTON_ID)
      )?.focus()
    );
    return () => window.cancelAnimationFrame(frame);
  }, [rowModal]);
  const open = (action: RowModal["action"], profile: TargetProfile) =>
    openModalAfterMenuClose(() => {
      focusOnClose.current = `#${rowActionsCellId(profile.id)} button`;
      setRowModal({ action, profile });
    });
  const close = () => setRowModal(null);
  /** Closes the Delete confirm once the profile is being deleted. */
  const closeAfterDelete = () => {
    focusOnClose.current = `#${CREATE_BUTTON_ID}`;
    setRowModal(null);
  };
  return { rowModal, open, close, closeAfterDelete };
};

/** The archetype whose drawer a crumb opens on the Archetypes list, if any. */
const drawerArchetypeId = (path: string | undefined) => {
  if (!path) return null;
  const { pathname, search } = parsePath(path);
  return pathname === DevPaths.archetypes
    ? new URLSearchParams(search).get(
        `${TablePersistenceKeyPrefix.archetypes}:activeItem`
      )
    : null;
};

const TargetProfilesPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { archetypeId } = useParams<ArchetypeTargetProfilesRoute>();
  // Target profiles are part of the archetype resource; assigning a plan
  // writes the plan's migration path.
  const canWriteProfiles = useHasSomeScopes(archetypesWriteScopes);
  const canAssignPlans = useHasSomeScopes(plansWriteScopes);
  const canManageSkills = useCanManageSkills();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const {
    rowModal,
    open: openRowModal,
    close: closeRowModal,
    closeAfterDelete,
  } = useRowModal();
  const profileToDelete =
    rowModal?.action === "delete" ? rowModal.profile : null;
  // Manage skills keeps its own target and is not part of `rowModal`:
  // ManageSkillsModal is shared with other pages and returns focus to the
  // kebab itself.
  const [skillsTarget, setSkillsTarget] = useState<ManageSkillsTarget | null>(
    null
  );

  // Stop polling once the archetype cannot be read: a refetch of a query that
  // never had data resets it to loading and the page would flicker.
  const [isPollingStopped, setIsPollingStopped] = useState(false);
  const {
    archetype,
    isFetching: isArchetypeLoading,
    fetchError,
  } = useFetchArchetypeById(
    archetypeId,
    isPollingStopped ? false : DEFAULT_REFETCH_INTERVAL
  );
  if (fetchError != null && !archetype && !isPollingStopped) {
    setIsPollingStopped(true);
  }
  const isNotFound =
    isAxiosError(fetchError) && fetchError.response?.status === 404;

  // The leaf is "Target profiles" even when a row is selected, and the owning
  // archetype is always its parent, also when the trail starts elsewhere such
  // as a migration plan. A list link followed while another
  // archetype's drawer was open ends in that drawer, which the owner replaces.
  const leaf = t("terms.targetProfiles");
  const { breadcrumbs: incomingCrumbs } = useEntityBreadcrumbs(leaf, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const incomingAncestors = incomingCrumbs.slice(0, -1);
  const lastDrawerId = drawerArchetypeId(incomingAncestors.at(-1)?.path);
  const ancestors =
    archetype && lastDrawerId !== String(archetype.id)
      ? [
          ...(lastDrawerId != null
            ? incomingAncestors.slice(0, -1)
            : incomingAncestors),
          { title: archetype.name, path: archetypePath(archetype.id) },
        ]
      : incomingAncestors;
  const breadcrumbs = [...ancestors, { title: leaf }];
  const linkCrumbs = [
    ...ancestors,
    { title: leaf, path: createPath(location) },
  ];
  const to = (pathname: string, search = "") =>
    breadcrumbTo(pathname, search, linkCrumbs);

  const selectedProfile = archetype?.profiles?.find(
    (profile) => location.hash === `#target-profile-${profile.id}`
  );
  const selectedProfileId = selectedProfile?.id;
  React.useEffect(() => {
    if (selectedProfileId != null) {
      const row = document.getElementById(
        `target-profile-${selectedProfileId}`
      );
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
    }
  }, [selectedProfileId]);

  const { deleteTargetProfile } = useArchetypeMutations();
  // Plans and skills exist only where the agentic API is available.
  const numericArchetypeId = Number(archetypeId);
  const {
    getAssignedPlan,
    eligiblePlans: eligibleMigrationPlans,
    isLoading: isPlansLoading,
    isError: isPlansError,
  } = useTargetProfilePlans(
    Number.isInteger(numericArchetypeId) ? numericArchetypeId : undefined
  );
  const {
    skills,
    isLoading: isSkillsLoading,
    fetchError: skillsError,
  } = useFetchSkills({ enabled: isAgenticEnabled });
  const isSkillsError = skillsError != null;
  const profileSkills = (profile: TargetProfile) =>
    skills.filter((skill) =>
      skill.associations?.some(
        (association) =>
          association.scope === "targetProfile" &&
          association.resource.id === profile.id
      )
    );
  const onDeleteProfile = (profile: TargetProfile | null) => {
    if (!archetype || !profile) return;
    deleteTargetProfile(archetype, profile);
    closeAfterDelete();
  };

  if (!archetype && fetchError != null) {
    return (
      <EntityDetailUnavailable
        breadcrumbs={breadcrumbs}
        isNotFound={isNotFound}
        notFoundTitle={t("agentic.archetype.notFoundTitle")}
        notFoundBody={t("agentic.archetype.notFoundBody")}
        backLabel={t("agentic.archetype.backToArchetypes")}
        backPath={DevPaths.archetypes}
      />
    );
  }

  const profiles = archetype?.profiles ?? [];
  const hasRowActions =
    canWriteProfiles || (isAgenticEnabled && canAssignPlans) || canManageSkills;
  // In the toolbar, and also in the empty state when there are no rows.
  const createButton = (id: string) =>
    canWriteProfiles ? (
      <Button
        type="button"
        id={id}
        variant={ButtonVariant.primary}
        isDisabled={!archetype}
        onClick={() => setIsCreateModalOpen(true)}
      >
        {t("dialog.title.newTargetProfile")}
      </Button>
    ) : null;
  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={leaf}
          description={
            <Content component="p">
              {isAgenticEnabled
                ? t("agentic.archetype.targetProfilesDescription")
                : t("agentic.archetype.targetProfilesDescriptionWithoutPlans")}
            </Content>
          }
          breadcrumbs={breadcrumbs}
        />
      </PageSection>

      <PageSection>
        {isAgenticEnabled && (isPlansError || isSkillsError) && (
          <Alert
            variant="warning"
            isInline
            className={spacing.mbMd}
            title={t("agentic.archetype.agenticDataUnavailableTitle")}
          >
            {t("agentic.archetype.agenticDataUnavailableBody")}
          </Alert>
        )}
        {canWriteProfiles && (
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>{createButton(CREATE_BUTTON_ID)}</ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        )}

        <Table aria-label={leaf}>
          <Thead>
            <Tr>
              <Th>{t("terms.name")}</Th>
              <Th>{t("terms.generators")}</Th>
              <Th>{t("terms.analysisProfile")}</Th>
              {isAgenticEnabled && (
                <>
                  <Th>{t("agentic.entity.migrationPlan")}</Th>
                  <Th modifier="fitContent">{t("agentic.archetype.skills")}</Th>
                </>
              )}
              {hasRowActions && (
                <Th screenReaderText={t("actions.rowActions")} />
              )}
            </Tr>
          </Thead>
          <ConditionalTableBody
            isLoading={
              isArchetypeLoading ||
              (isAgenticEnabled && (isPlansLoading || isSkillsLoading))
            }
            isError={!!fetchError && !archetype}
            isNoData={profiles.length === 0}
            noDataEmptyState={
              <NoDataEmptyState
                title={t("agentic.archetype.noTargetProfilesTitle")}
                description={
                  !canWriteProfiles
                    ? t("agentic.archetype.noTargetProfilesBodyReadOnly")
                    : isAgenticEnabled
                      ? t("agentic.archetype.noTargetProfilesBody")
                      : t("agentic.archetype.noTargetProfilesBodyWithoutPlans")
                }
                actions={createButton(EMPTY_STATE_CREATE_BUTTON_ID)}
              />
            }
            numRenderedColumns={
              3 + (isAgenticEnabled ? 2 : 0) + (hasRowActions ? 1 : 0)
            }
          >
            <Tbody>
              {profiles.map((profile) => {
                const assignedPlan = getAssignedPlan(profile.id);
                // In the order of the columns. Generators and analysis
                // profile are part of the archetype, like the name.
                const editActions: IAction[] = [
                  ...(canWriteProfiles
                    ? [
                        {
                          title: t("actions.edit"),
                          onClick: () => openRowModal("edit", profile),
                        },
                        {
                          title: t("agentic.archetype.manageGenerators"),
                          onClick: () => openRowModal("generators", profile),
                        },
                        {
                          title:
                            profile.analysisProfile != null
                              ? t("agentic.archetype.changeAnalysisProfile")
                              : t("agentic.archetype.assignAnalysisProfile"),
                          onClick: () =>
                            openRowModal("analysisProfile", profile),
                        },
                      ]
                    : []),
                  ...(isAgenticEnabled && canAssignPlans
                    ? [
                        {
                          title: assignedPlan
                            ? t("agentic.archetype.changePlan")
                            : t("agentic.archetype.assignPlan"),
                          onClick: () => openRowModal("plan", profile),
                          ...disabledActionProps(
                            isPlansError
                              ? t("agentic.archetype.plansNotLoaded")
                              : undefined,
                            "left",
                            `target-profiles-table-row-${profile.id}-assign-plan`
                          ),
                        },
                      ]
                    : []),
                  ...(canManageSkills && archetype
                    ? [
                        {
                          title: t("agentic.skill.manageSkills.title"),
                          onClick: () =>
                            openModalAfterMenuClose(() =>
                              setSkillsTarget({
                                scope: "targetProfile",
                                id: profile.id,
                                name: profile.name,
                                archetype: {
                                  id: archetype.id,
                                  name: archetype.name,
                                },
                              })
                            ),
                          // When skills cannot be read, the modal says so.
                        },
                      ]
                    : []),
                ];
                // An assigned plan blocks Delete; without the plans query
                // that cannot be checked, and without the skills query the
                // confirm could not say which skills stop applying.
                const deleteBlocker = !isAgenticEnabled
                  ? undefined
                  : isPlansError || isSkillsError
                    ? t("agentic.common.usageUnchecked")
                    : assignedPlan
                      ? t("agentic.archetype.deleteBlocked", {
                          plan: assignedPlan.name,
                        })
                      : undefined;
                const rowActions: IAction[] = [
                  ...editActions,
                  ...(canWriteProfiles
                    ? [
                        ...(editActions.length > 0
                          ? [{ isSeparator: true }]
                          : []),
                        {
                          title: t("actions.delete"),
                          onClick: () => openRowModal("delete", profile),
                          ...deleteActionProps(
                            deleteBlocker,
                            `target-profiles-table-row-${profile.id}-delete`
                          ),
                        },
                      ]
                    : []),
                ];
                return (
                  <Tr
                    key={profile.id}
                    id={`target-profile-${profile.id}`}
                    tabIndex={-1}
                    isRowSelected={selectedProfile?.id === profile.id}
                  >
                    <Td dataLabel={t("terms.name")}>{profile.name}</Td>
                    <Td dataLabel={t("terms.generators")}>
                      <LabelsFromItems items={profile.generators} />
                    </Td>
                    <Td dataLabel={t("terms.analysisProfile")}>
                      {profile.analysisProfile?.name ?? (
                        <EmptyTextMessage
                          message={t("agentic.archetype.notAssigned")}
                        />
                      )}
                    </Td>
                    {isAgenticEnabled && (
                      <>
                        <Td dataLabel={t("agentic.entity.migrationPlan")}>
                          <AssignedMigrationPlan
                            plan={assignedPlan}
                            isError={isPlansError}
                            linkTo={(pathname) => to(pathname)}
                          />
                        </Td>
                        <Td
                          dataLabel={t("agentic.archetype.skills")}
                          modifier="nowrap"
                        >
                          <TargetProfileSkills
                            profile={profile}
                            skills={profileSkills(profile)}
                            isError={isSkillsError}
                            linkTo={(pathname) => to(pathname)}
                          />
                        </Td>
                      </>
                    )}
                    {hasRowActions && (
                      <Td isActionCell id={rowActionsCellId(profile.id)}>
                        <ActionsColumn items={rowActions} />
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </Tbody>
          </ConditionalTableBody>
        </Table>
      </PageSection>

      {archetype && (
        <>
          {isCreateModalOpen && (
            <CreateTargetProfileModal
              archetype={archetype}
              onClose={() => setIsCreateModalOpen(false)}
            />
          )}

          {rowModal?.action === "edit" && (
            <EditTargetProfileModal
              key={rowModal.profile.id}
              archetype={archetype}
              profile={rowModal.profile}
              onClose={closeRowModal}
            />
          )}

          {rowModal?.action === "generators" && (
            <ManageGeneratorsModal
              key={rowModal.profile.id}
              archetype={archetype}
              profile={rowModal.profile}
              linkTo={(pathname) => to(pathname)}
              onClose={closeRowModal}
            />
          )}

          {rowModal?.action === "analysisProfile" && (
            <AssignAnalysisProfileModal
              key={rowModal.profile.id}
              archetype={archetype}
              profile={rowModal.profile}
              linkTo={(pathname) => to(pathname)}
              onClose={closeRowModal}
            />
          )}

          {rowModal?.action === "plan" && (
            <AssignMigrationPlanModal
              key={rowModal.profile.id}
              archetype={archetype}
              profile={rowModal.profile}
              assignedPlan={getAssignedPlan(rowModal.profile.id)}
              eligiblePlans={eligibleMigrationPlans}
              isPlansError={isPlansError}
              linkTo={(pathname) => to(pathname)}
              onClose={closeRowModal}
            />
          )}

          {canManageSkills && (
            <ManageSkillsModal
              target={skillsTarget}
              onClose={() => setSkillsTarget(null)}
            />
          )}

          {/* Delete Confirmation Modal */}
          <ConfirmDialog
            isOpen={!!profileToDelete}
            title={t("agentic.archetype.deleteTitle")}
            message={
              profileToDelete &&
              // The skills consequence only when it applies.
              (isAgenticEnabled && profileSkills(profileToDelete).length > 0
                ? t("agentic.archetype.deleteBodyWithSkills", {
                    profile: profileToDelete.name,
                    count: profileSkills(profileToDelete).length,
                  })
                : t("agentic.archetype.deleteBody", {
                    profile: profileToDelete.name,
                  }))
            }
            confirmBtnLabel={t("actions.delete")}
            confirmBtnVariant={ButtonVariant.danger}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={closeRowModal}
            onClose={closeRowModal}
            onConfirm={() => onDeleteProfile(profileToDelete)}
          />
        </>
      )}
    </>
  );
};

export default TargetProfilesPage;
