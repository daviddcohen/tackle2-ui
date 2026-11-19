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

import { AssignMigrationPlanModal } from "./components/assign-migration-plan-modal";
import { AssignedMigrationPlan } from "./components/assigned-migration-plan";
import TargetProfileForm from "./components/target-profile-form";
import { TargetProfileSkills } from "./components/target-profile-skills";
import { useArchetypeMutations } from "./hooks/useArchetypeMutations";
import { useTargetProfilePlans } from "./hooks/useTargetProfilePlans";

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

  const [openCreateModal, setOpenCreateModal] = useState<boolean>(false);
  const [profileToEdit, setProfileToEdit] = useState<TargetProfile | null>(
    null
  );
  const [profileToDelete, setProfileToDelete] = useState<TargetProfile | null>(
    null
  );
  const [profileForPlan, setProfileForPlan] = useState<TargetProfile | null>(
    null
  );
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

  const { addTargetProfile, updateTargetProfile, deleteTargetProfile } =
    useArchetypeMutations();
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
  const onAddProfile = (profile: TargetProfile) => {
    if (!archetype) return;
    addTargetProfile(archetype, profile);
    setOpenCreateModal(false);
  };

  const onEditProfile = (profile: TargetProfile) => {
    if (!archetype) return;
    updateTargetProfile(archetype, profile);
    setProfileToEdit(null);
  };

  const onDeleteProfile = (profile: TargetProfile | null) => {
    if (!archetype || !profile) return;
    deleteTargetProfile(archetype, profile);
    setProfileToDelete(null);
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
  const createButton = canWriteProfiles ? (
    <Button
      type="button"
      id="create-target-profile"
      variant={ButtonVariant.primary}
      isDisabled={!archetype}
      onClick={() => setOpenCreateModal(true)}
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
            isAgenticEnabled
              ? t("agentic.archetype.targetProfilesDescription")
              : t("agentic.archetype.targetProfilesDescriptionWithoutPlans")
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
        {createButton && (
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>{createButton}</ToolbarItem>
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
                actions={createButton}
              />
            }
            numRenderedColumns={
              3 + (isAgenticEnabled ? 2 : 0) + (hasRowActions ? 1 : 0)
            }
          >
            <Tbody>
              {profiles.map((profile) => {
                const assignedPlan = getAssignedPlan(profile.id);
                const editActions: IAction[] = [
                  ...(canWriteProfiles
                    ? [
                        {
                          title: t("actions.edit"),
                          onClick: () =>
                            openModalAfterMenuClose(() =>
                              setProfileToEdit(profile)
                            ),
                        },
                      ]
                    : []),
                  ...(isAgenticEnabled && canAssignPlans
                    ? [
                        {
                          title: assignedPlan
                            ? t("agentic.archetype.changePlan")
                            : t("agentic.archetype.assignPlan"),
                          onClick: () =>
                            openModalAfterMenuClose(() =>
                              setProfileForPlan(profile)
                            ),
                          ...disabledActionProps(
                            isPlansError
                              ? t("agentic.archetype.plansNotLoaded")
                              : undefined,
                            "left"
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
                          onClick: () =>
                            openModalAfterMenuClose(() =>
                              setProfileToDelete(profile)
                            ),
                          ...deleteActionProps(deleteBlocker),
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
                      {profile.analysisProfile?.name ?? "-"}
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
                      <Td isActionCell>
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
          {/* Create Modal */}
          <TargetProfileForm
            key={openCreateModal ? "opened" : "closed"}
            isOpen={openCreateModal}
            archetype={archetype}
            onCancel={() => setOpenCreateModal(false)}
            onSave={(profile) => onAddProfile(profile)}
          />

          {/* Edit Modal */}
          <TargetProfileForm
            key={profileToEdit?.id ?? -1}
            isOpen={!!profileToEdit}
            archetype={archetype}
            profile={profileToEdit}
            onCancel={() => setProfileToEdit(null)}
            onSave={(profile) => onEditProfile(profile)}
          />

          {profileForPlan && (
            <AssignMigrationPlanModal
              key={profileForPlan.id}
              archetype={archetype}
              profile={profileForPlan}
              assignedPlan={getAssignedPlan(profileForPlan.id)}
              eligiblePlans={eligibleMigrationPlans}
              isPlansError={isPlansError}
              linkTo={(pathname) => to(pathname)}
              onClose={() => setProfileForPlan(null)}
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
                    archetype: archetype.name,
                  })
                : t("agentic.archetype.deleteBody", {
                    profile: profileToDelete.name,
                  }))
            }
            confirmBtnLabel={t("actions.delete")}
            confirmBtnVariant={ButtonVariant.danger}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={() => setProfileToDelete(null)}
            onClose={() => setProfileToDelete(null)}
            onConfirm={() => onDeleteProfile(profileToDelete)}
          />
        </>
      )}
    </>
  );
};

export default TargetProfilesPage;
