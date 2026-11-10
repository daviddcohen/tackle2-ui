import { useState } from "react";
import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Link, generatePath, useLocation, useParams } from "react-router-dom";
import {
  Alert,
  AlertVariant,
  Button,
  ButtonVariant,
  EmptyState,
  EmptyStateBody,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
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
  IAction,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { DEFAULT_REFETCH_INTERVAL, isAgenticEnabled } from "@app/Constants";
import { ArchetypeTargetProfilesRoute, DevPaths } from "@app/Paths";
import type { EntityId } from "@app/agentic";
import type { TargetProfile } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { ConditionalTableBody } from "@app/components/TableControls";
import { LabelsFromItems } from "@app/components/labels/labels-from-items/labels-from-items";
import { archetypePath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useAssignPlanToTargetProfileMutation,
  useFetchMigrationPlans,
  useFetchSkills,
} from "@app/queries/agentic";
import { useFetchArchetypeById } from "@app/queries/archetypes";
import { archetypesWriteScopes, plansWriteScopes } from "@app/scopes";
import {
  getAxiosErrorMessage,
  openModalAfterMenuClose,
} from "@app/utils/utils";

import TargetProfileForm from "./components/target-profile-form";
import { useArchetypeMutations } from "./hooks/useArchetypeMutations";

const TargetProfilesPage: React.FC = () => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const location = useLocation();
  const { archetypeId } = useParams<ArchetypeTargetProfilesRoute>();
  // Target profiles are part of the archetype resource; assigning a Plan
  // writes the Plan's migration path.
  const canWriteProfiles = useHasSomeScopes(archetypesWriteScopes);
  const canAssignPlans = useHasSomeScopes(plansWriteScopes);

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
  const [selectedPlanId, setSelectedPlanId] = useState<EntityId | null>(null);

  // Stop polling once the archetype cannot be read: a refetch of a query that
  // never had data resets it to loading and the page would flicker.
  const [isPollingStopped, setIsPollingStopped] = useState(false);
  const {
    archetype,
    isFetching: isArchetypesFetching,
    fetchError,
  } = useFetchArchetypeById(
    archetypeId,
    isPollingStopped ? false : DEFAULT_REFETCH_INTERVAL
  );
  if (fetchError != null && !archetype && !isPollingStopped) {
    setIsPollingStopped(true);
  }

  const selectedProfile = archetype?.profiles?.find(
    (profile) => location.hash === `#target-profile-${profile.id}`
  );
  const { breadcrumbs, to } = useEntityBreadcrumbs(
    selectedProfile?.name ?? t("terms.targetProfiles"),
    [
      { title: t("terms.archetypes"), path: DevPaths.archetypes },
      ...(archetype
        ? [{ title: archetype.name, path: archetypePath(archetype.id) }]
        : []),
    ]
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
  // Plans and Skills exist only where the agentic API is available.
  const { migrationPlans } = useFetchMigrationPlans({
    enabled: isAgenticEnabled,
  });
  const { skills } = useFetchSkills({ enabled: isAgenticEnabled });
  const eligibleMigrationPlans = migrationPlans.filter(
    (plan) =>
      !plan.migrationPath || plan.migrationPath.archetype.id === archetype?.id
  );
  const { mutateAsync: assignPlanToProfile, isPending: isAssigningPlan } =
    useAssignPlanToTargetProfileMutation(
      () => undefined,
      (error: AxiosError) =>
        pushNotification({
          title: getAxiosErrorMessage(error),
          variant: "danger",
        })
    );

  const getAssignedPlan = React.useCallback(
    (profile: TargetProfile) =>
      migrationPlans.find(
        (plan) =>
          plan.migrationPath?.archetype.id === archetype?.id &&
          plan.migrationPath?.targetProfiles.some(
            (targetProfile) => targetProfile.id === profile.id
          ) &&
          plan.migrationPath.isDefault
      ),
    [archetype?.id, migrationPlans]
  );

  const openPlanAssignment = (profile: TargetProfile) => {
    setProfileForPlan(profile);
    setSelectedPlanId(getAssignedPlan(profile)?.id ?? null);
  };

  const assignPlan = async () => {
    if (!archetype || !profileForPlan || selectedPlanId == null) return;

    try {
      await assignPlanToProfile({
        archetypeId: archetype.id,
        targetProfileId: profileForPlan.id,
        planId: selectedPlanId,
      });
      pushNotification({
        title: t("agentic.plan.assignmentSaved"),
        variant: "success",
      });
      setProfileForPlan(null);
      setSelectedPlanId(null);
    } catch {
      return;
    }
  };

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

  if (isArchetypesFetching && !archetype && fetchError == null) {
    return <AppPlaceholder />;
  }

  if (!archetype) {
    return (
      <PageSection hasBodyWrapper={false}>
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        <Alert variant={AlertVariant.warning} title={t("message.notFound")}>
          {t("message.archetypeNotFound")}
        </Alert>
      </PageSection>
    );
  }

  const profiles = archetype?.profiles || [];
  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("titles.archetypeTargetProfiles", {
            archetypeName: archetype.name,
          })}
          breadcrumbs={breadcrumbs}
        />
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <ConditionalRender
          when={isArchetypesFetching}
          then={<AppPlaceholder />}
        >
          <div
            style={{
              backgroundColor:
                "var(--pf-t--global--background--color--primary--default)",
            }}
          >
            <Toolbar>
              <ToolbarContent>
                {canWriteProfiles && (
                  <ToolbarGroup variant="action-group">
                    <ToolbarItem>
                      <Button
                        type="button"
                        id="create-target-profile"
                        aria-label={t("dialog.title.newTargetProfile")}
                        variant={ButtonVariant.primary}
                        onClick={() => setOpenCreateModal(true)}
                      >
                        {t("dialog.title.newTargetProfile")}
                      </Button>
                    </ToolbarItem>
                  </ToolbarGroup>
                )}
              </ToolbarContent>
            </Toolbar>

            <Table aria-label="Target profiles table">
              <Thead>
                <Tr>
                  <Th width={20}>{t("terms.name")}</Th>
                  <Th width={20}>{t("terms.generators")}</Th>
                  <Th width={20}>{t("terms.analysisProfile")}</Th>
                  {isAgenticEnabled && (
                    <Th width={20}>{t("agentic.plan.associatedPlan")}</Th>
                  )}
                  {isAgenticEnabled && (
                    <Th width={20}>{t("agentic.skill.title")}</Th>
                  )}
                  <Th screenReaderText={t("actions.rowActions")} />
                </Tr>
              </Thead>
              <ConditionalTableBody
                isLoading={isArchetypesFetching}
                isError={!!fetchError}
                isNoData={profiles.length === 0}
                noDataEmptyState={
                  <EmptyState
                    headingLevel="h2"
                    icon={CubesIcon}
                    titleText={t("message.noTargetProfilesTitle")}
                    variant="sm"
                  >
                    <EmptyStateBody>
                      {t("message.noTargetProfilesCreate")}
                    </EmptyStateBody>
                  </EmptyState>
                }
                numRenderedColumns={isAgenticEnabled ? 6 : 4}
              >
                <Tbody>
                  {profiles.map((profile) => {
                    const assignedPlan = getAssignedPlan(profile);
                    const rowActions: IAction[] = [
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
                                ? t("agentic.plan.changePlan")
                                : t("agentic.plan.assignPlan"),
                              onClick: () =>
                                openModalAfterMenuClose(() =>
                                  openPlanAssignment(profile)
                                ),
                            },
                          ]
                        : []),
                      ...(canWriteProfiles
                        ? [
                            {
                              title: t("actions.delete"),
                              onClick: () =>
                                openModalAfterMenuClose(() =>
                                  setProfileToDelete(profile)
                                ),
                              isDanger: true,
                              isAriaDisabled: assignedPlan != null,
                              tooltipProps: assignedPlan
                                ? {
                                    content: t(
                                      "agentic.plan.deleteProfilePlanAssociated"
                                    ),
                                  }
                                : undefined,
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
                            <Td dataLabel={t("agentic.plan.associatedPlan")}>
                              <div>
                                {assignedPlan ? (
                                  <>
                                    <Link
                                      to={to(
                                        DevPaths.migrationPlanDetails.replace(
                                          ":planId",
                                          assignedPlan.id.toString()
                                        )
                                      )}
                                    >
                                      {assignedPlan.name}
                                    </Link>{" "}
                                    <Label color="green" isCompact>
                                      {t("agentic.plan.associated")}
                                    </Label>
                                  </>
                                ) : (
                                  <Label color="orange" isCompact>
                                    {t("agentic.plan.notAssigned")}
                                  </Label>
                                )}
                              </div>
                            </Td>
                            <Td dataLabel={t("agentic.skill.title")}>
                              <div>
                                {skills
                                  .filter((skill) =>
                                    skill.associations?.some(
                                      (association) =>
                                        association.scope === "targetProfile" &&
                                        association.resource.id === profile.id
                                    )
                                  )
                                  .map((skill, index) => (
                                    <React.Fragment key={skill.id}>
                                      {index > 0 && ", "}
                                      <Link
                                        to={to(
                                          generatePath(DevPaths.skillDetails, {
                                            skillId: String(skill.id),
                                          })
                                        )}
                                      >
                                        {skill.name}
                                      </Link>
                                    </React.Fragment>
                                  ))}
                                {!skills.some((skill) =>
                                  skill.associations?.some(
                                    (association) =>
                                      association.scope === "targetProfile" &&
                                      association.resource.id === profile.id
                                  )
                                ) && t("agentic.skill.notUsed")}
                              </div>
                            </Td>
                          </>
                        )}
                        <Td isActionCell>
                          {rowActions.length > 0 && (
                            <ActionsColumn items={rowActions} />
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </ConditionalTableBody>
            </Table>
          </div>
        </ConditionalRender>
      </PageSection>

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

      <Modal
        variant="small"
        isOpen={profileForPlan != null}
        onClose={() => setProfileForPlan(null)}
      >
        <ModalHeader
          title={t("agentic.plan.assignPlan")}
          description={t("agentic.plan.assignPlanDescription", {
            archetype: archetype.name,
            target: profileForPlan?.name,
          })}
        />
        <ModalBody>
          <FormGroup
            label={t("agentic.plan.associatedPlan")}
            fieldId="associated-plan-select"
            isRequired
          >
            <FormSelect
              id="associated-plan-select"
              value={selectedPlanId ?? ""}
              onChange={(_event, value) => setSelectedPlanId(value || null)}
              aria-label={t("agentic.plan.associatedPlan")}
            >
              <FormSelectOption
                value=""
                label={t("agentic.plan.selectPlan")}
                isDisabled
              />
              {eligibleMigrationPlans.map((plan) => (
                <FormSelectOption
                  key={plan.id}
                  value={plan.id.toString()}
                  label={plan.name}
                />
              ))}
            </FormSelect>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={assignPlan}
            isDisabled={selectedPlanId == null || isAssigningPlan}
            isLoading={isAssigningPlan}
          >
            {t("agentic.plan.saveAssignment")}
          </Button>
          <Button variant="link" onClick={() => setProfileForPlan(null)}>
            {t("actions.cancel")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!profileToDelete}
        titleIconVariant={"warning"}
        title={t("dialog.title.delete", {
          what: t("terms.targetProfile"),
        })}
        message={
          profileToDelete && (
            <>
              {t("dialog.message.delete", {
                what: t("terms.targetProfile").toLowerCase(),
              })}
              <br />
              <strong>{profileToDelete.name}</strong>
            </>
          )
        }
        confirmBtnLabel={t("actions.delete")}
        confirmBtnVariant={ButtonVariant.danger}
        cancelBtnLabel={t("actions.cancel")}
        onCancel={() => setProfileToDelete(null)}
        onClose={() => setProfileToDelete(null)}
        onConfirm={() => onDeleteProfile(profileToDelete)}
      />
    </>
  );
};

export default TargetProfilesPage;
