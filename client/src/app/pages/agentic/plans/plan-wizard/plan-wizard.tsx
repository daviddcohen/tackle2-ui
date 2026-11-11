import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { FieldErrors, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, boolean, number, object, string } from "yup";
import {
  Alert,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Modal,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
  Stack,
  StackItem,
  TextArea,
  TextInput,
  Wizard,
  WizardHeader,
  WizardStep,
  useWizardContext,
} from "@patternfly/react-core";
import { PlusCircleIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { MigrationPlan, MigrationPlanRequest } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { targetProfilesPath } from "@app/pages/agentic/entity-paths";
import {
  useCreateMigrationPlanMutation,
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlans,
  useUpdateMigrationPlanMutation,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { PlanSection, PlanSections } from "../components/plan-section";
import { StageCard, StageFormData } from "../components/stage-card";
import { StagesTable } from "../components/stages-table";

interface PlanWizardProps {
  isOpen: boolean;
  plan: MigrationPlan | null;
  onClose: () => void;
}

interface PlanFormValues {
  name: string;
  description: string;
  archetypeId: number | null;
  targetProfileIds: number[];
  stages: StageFormData[];
}

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;

/** The menus inside the wizard are appended here (addenda P12). */
const MODAL_ID = "plan-wizard";

const DETAILS_STEP_ID = "step-plan-details";
const PATH_STEP_ID = "step-migration-path";
const STAGES_STEP_ID = "step-stages";
type EditableStepId =
  | typeof DETAILS_STEP_ID
  | typeof PATH_STEP_ID
  | typeof STAGES_STEP_ID;

/** The first wizard step that holds an invalid field, if any. */
const firstInvalidStep = (
  errors: FieldErrors<PlanFormValues>
): EditableStepId | undefined => {
  if (errors.name != null || errors.description != null) {
    return DETAILS_STEP_ID;
  }
  if (errors.archetypeId != null || errors.targetProfileIds != null) {
    return PATH_STEP_ID;
  }
  return errors.stages != null ? STAGES_STEP_ID : undefined;
};

/**
 * Shown on the Review step when submitting found invalid fields: names the
 * step that holds them and moves there (it renders inside the Wizard, so it
 * can use the wizard context).
 */
const InvalidStepAlert: React.FC<{
  stepId: EditableStepId;
  stepName: string;
}> = ({ stepId, stepName }) => {
  const { t } = useTranslation();
  const { goToStepById } = useWizardContext();
  return (
    <Alert
      isInline
      variant="danger"
      title={t("agentic.plan.validation.invalidStep", { step: stepName })}
      actionLinks={
        <Button variant="link" isInline onClick={() => goToStepById(stepId)}>
          {t("agentic.plan.validation.goToStep", { step: stepName })}
        </Button>
      }
    />
  );
};

/** "View target profiles" in the create toast (addenda P3): a new plan is not assigned yet. */
const TargetProfilesToastLink: React.FC<{ archetypeId: number }> = ({
  archetypeId,
}) => {
  const { t } = useTranslation();
  const link = useLinkComponent(targetProfilesPath(archetypeId));
  return (
    <Button variant="link" isInline component={link}>
      {t("agentic.plan.viewTargetProfiles")}
    </Button>
  );
};

let nextStageKey = 0;
const newStageKey = () => `new-${(nextStageKey += 1)}`;

const emptyStage = (order: number): StageFormData => ({
  formKey: newStageKey(),
  name: "",
  agentId: null,
  instructions: "",
  requiresApproval: false,
  order,
});

const helper = (
  text: string,
  variant?: "error" | "warning" | "default"
): React.ReactNode => (
  <FormHelperText>
    <HelperText>
      <HelperTextItem variant={variant}>{text}</HelperTextItem>
    </HelperText>
  </FormHelperText>
);

/**
 * Create or edit a migration plan in four steps (guide 4.5, 7.3, plans
 * amendment 2): Plan details, Migration path, Stages, Review. Next stays
 * disabled until the step is valid, and every control that blocks it says
 * why. Creating visits the steps in order; editing can open any step.
 */
export const PlanWizard: React.FC<PlanWizardProps> = ({
  isOpen,
  plan,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
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
    migrationPlans,
    isLoading: isLoadingPlans,
    fetchError: plansFetchError,
  } = useFetchMigrationPlans();
  const {
    archetypes,
    isFetching: isLoadingArchetypes,
    error: archetypesFetchError,
  } = useFetchArchetypes(false);
  const loadedAgents =
    isLoadingAgents || agentsFetchError != null ? undefined : agents;
  const loadedModels =
    isLoadingModels || modelsFetchError != null ? undefined : gateways;
  const arePlansLoaded = !isLoadingPlans && plansFetchError == null;
  const areArchetypesLoaded =
    !isLoadingArchetypes && archetypesFetchError == null;

  const isDuplicateName = React.useCallback(
    (value: string | undefined) =>
      migrationPlans.some(
        (migrationPlan) =>
          migrationPlan.id !== plan?.id &&
          migrationPlan.name.trim().toLocaleLowerCase() ===
            (value || "").trim().toLocaleLowerCase()
      ),
    [migrationPlans, plan]
  );

  const validationSchema = React.useMemo(
    () =>
      object({
        name: string()
          .trim()
          .required(t("agentic.plan.validation.nameRequired"))
          .max(NAME_MAX_LENGTH, t("agentic.plan.validation.nameMaximum"))
          .test(
            "duplicate-name",
            t("agentic.plan.validation.nameDuplicate"),
            (value) => !isDuplicateName(value)
          ),
        description: string()
          .defined()
          .max(
            DESCRIPTION_MAX_LENGTH,
            t("agentic.plan.validation.descriptionMaximum")
          ),
        archetypeId: number().nullable().required(),
        targetProfileIds: array().of(number().required()).min(1).required(),
        stages: array()
          .of(
            object({
              name: string().trim().required(),
              id: string().optional(),
              formKey: string().required(),
              agentId: string().nullable().required(),
              instructions: string().defined(),
              requiresApproval: boolean().required(),
              order: number().required(),
            })
          )
          .min(1)
          .required(),
      }),
    [isDuplicateName, t]
  );

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PlanFormValues>({
    defaultValues: {
      name: "",
      description: "",
      archetypeId: null,
      targetProfileIds: [],
      stages: [emptyStage(1)],
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const name = useWatch({ control, name: "name" });
  const description = useWatch({ control, name: "description" });
  const archetypeId = useWatch({ control, name: "archetypeId" });
  const targetProfileIds = useWatch({ control, name: "targetProfileIds" });
  const stages = useWatch({ control, name: "stages" });

  const [isArchetypeSelectOpen, setIsArchetypeSelectOpen] =
    React.useState(false);
  // Step that blocked the last submit; cleared when the wizard reopens.
  const [invalidStepId, setInvalidStepId] = React.useState<EditableStepId>();
  // Stage cards that are open: new stages open, existing ones start closed (4.5).
  const [expandedStageKeys, setExpandedStageKeys] = React.useState<string[]>(
    []
  );

  React.useEffect(() => {
    setInvalidStepId(undefined);
    if (plan) {
      reset({
        name: plan.name,
        description: plan.description,
        archetypeId: plan.migrationPath?.archetype.id ?? null,
        targetProfileIds:
          plan.migrationPath?.targetProfiles.map((profile) => profile.id) ?? [],
        stages: [...plan.stages]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            id: s.id,
            formKey: `stage-${s.id}`,
            name: s.name,
            agentId: s.agent?.id ?? null,
            instructions: s.instructions,
            requiresApproval: s.requiresApproval,
            order: s.order,
          })),
      });
      setExpandedStageKeys([]);
    } else {
      const first = emptyStage(1);
      reset({
        name: "",
        description: "",
        archetypeId: null,
        targetProfileIds: [],
        stages: [first],
      });
      setExpandedStageKeys([first.formKey]);
    }
  }, [plan, isOpen, reset]);

  const onSuccess = () => {
    pushNotification({
      title: plan ? t("agentic.plan.updated") : t("agentic.plan.created"),
      // The form still holds the submitted values when the save answers.
      message:
        !plan && archetypeId != null ? (
          <TargetProfilesToastLink archetypeId={archetypeId} />
        ) : undefined,
      variant: "success",
    });
    onClose();
  };

  const onError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: createPlan, isPending: isCreating } =
    useCreateMigrationPlanMutation(onSuccess, onError);
  const { mutate: updatePlan, isPending: isUpdating } =
    useUpdateMigrationPlanMutation(onSuccess, onError);
  const isSaving = isCreating || isUpdating;

  const submitPlan = (formValues: PlanFormValues) => {
    setInvalidStepId(undefined);
    const {
      name: submittedName,
      description: submittedDescription,
      archetypeId: archetype,
      targetProfileIds: submittedTargetProfileIds,
      stages: submittedStages,
    } = formValues;
    // Server-owned fields (ids of new stages, effective skills, impact) are
    // not sent; existing stages keep their ids so plan runs stay linked.
    const payload: MigrationPlanRequest = {
      name: submittedName.trim(),
      description: submittedDescription.trim(),
      // Built from the form's ids, not the loaded archetypes, so a slow or
      // failed archetypes query cannot drop the path; the server validates them.
      migrationPath:
        archetype != null && submittedTargetProfileIds.length > 0
          ? {
              archetype: { id: archetype },
              targetProfiles: submittedTargetProfileIds.map((id) => ({ id })),
              isDefault: plan?.migrationPath?.isDefault ?? false,
            }
          : undefined,
      stages: submittedStages
        .filter((s) => s.agentId != null)
        .map((s) => ({
          id: s.id,
          name: s.name,
          agent: { id: s.agentId ?? "" },
          instructions: s.instructions,
          requiresApproval: s.requiresApproval,
        })),
    };

    if (plan) {
      updatePlan({ ...payload, id: plan.id });
    } else {
      createPlan(payload);
    }
  };

  const setStages = (updated: StageFormData[]) =>
    setValue(
      "stages",
      updated.map((stage, index) => ({ ...stage, order: index + 1 })),
      { shouldDirty: true, shouldValidate: true }
    );

  const addStage = () => {
    const added = emptyStage(stages.length + 1);
    setStages([...stages, added]);
    setExpandedStageKeys((keys) => [...keys, added.formKey]);
  };

  const moveStage = (index: number, destination: number) => {
    if (destination < 0 || destination >= stages.length) return;
    const updated = [...stages];
    const [movedStage] = updated.splice(index, 1);
    updated.splice(destination, 0, movedStage);
    setStages(updated);
  };

  const toggleStage = (formKey: string) =>
    setExpandedStageKeys((keys) =>
      keys.includes(formKey)
        ? keys.filter((key) => key !== formKey)
        : [...keys, formKey]
    );

  const trimmedName = (name || "").trim();
  const isDetailsValid =
    trimmedName.length > 0 &&
    trimmedName.length <= NAME_MAX_LENGTH &&
    (description || "").length <= DESCRIPTION_MAX_LENGTH &&
    // The duplicate check needs every plan (P8).
    arePlansLoaded &&
    !isDuplicateName(name);
  // A saved path or stage agent is only confirmed once its options load (P8).
  const isPathValid =
    areArchetypesLoaded && archetypeId != null && targetProfileIds.length > 0;
  const isStagesValid =
    loadedAgents != null &&
    (stages || []).length > 0 &&
    stages.every((s) => s.name.trim() && s.agentId != null);
  // Editing can open Review directly: it cannot state names it has not loaded.
  const areOptionsLoaded =
    arePlansLoaded && areArchetypesLoaded && loadedAgents != null;

  const selectedArchetype = archetypes.find((a) => a.id === archetypeId);
  const targetProfiles = selectedArchetype?.profiles ?? [];
  const selectedTargetProfiles = targetProfiles.filter((profile) =>
    targetProfileIds.includes(profile.id)
  );
  const isPathAssigned = plan?.migrationPath?.isDefault === true;
  // Review names come from the archetypes query (X6).
  const archetypesState = isLoadingArchetypes ? (
    <Skeleton width="8rem" screenreaderText={t("terms.loading")} />
  ) : (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );

  const stepNames: Record<EditableStepId, string> = {
    [DETAILS_STEP_ID]: t("agentic.plan.detailsStep"),
    [PATH_STEP_ID]: t("agentic.plan.pathStep"),
    [STAGES_STEP_ID]: t("agentic.plan.stages"),
  };

  if (!isOpen) {
    return null;
  }

  const appendToModal = () =>
    document.getElementById(MODAL_ID) ?? document.body;

  return (
    <Modal
      id={MODAL_ID}
      isOpen={isOpen}
      aria-label={
        plan ? t("agentic.plan.editPlan") : t("agentic.plan.createTitle")
      }
      onEscapePress={(event: KeyboardEvent) => {
        // Escape in an open select closes that select, not the wizard.
        if (
          event.target instanceof Element &&
          event.target.closest(
            '[role="listbox"], [role="menu"], [aria-expanded="true"]'
          )
        ) {
          return;
        }
        onClose();
      }}
      variant="large"
    >
      <Wizard
        onClose={onClose}
        header={
          <WizardHeader
            onClose={onClose}
            closeButtonAriaLabel={t("agentic.plan.closeWizard")}
            title={
              plan ? t("agentic.plan.editPlan") : t("agentic.plan.createTitle")
            }
            description={t("agentic.plan.wizardDescription")}
          />
        }
        isVisitRequired={!plan}
      >
        <WizardStep
          id={DETAILS_STEP_ID}
          name={stepNames[DETAILS_STEP_ID]}
          footer={{ isBackHidden: true, isNextDisabled: !isDetailsValid }}
        >
          <Form onSubmit={(event) => event.preventDefault()}>
            <FormGroup label={t("terms.name")} isRequired fieldId="plan-name">
              <TextInput
                id="plan-name"
                isRequired
                value={name}
                onChange={(_event, value) =>
                  setValue("name", value, {
                    shouldDirty: true,
                    shouldValidate: arePlansLoaded,
                  })
                }
                validated={arePlansLoaded && errors.name ? "error" : "default"}
              />
              {plansFetchError != null
                ? helper(t("agentic.plan.plansLoadFailed"), "error")
                : isLoadingPlans
                  ? helper(t("agentic.plan.loadingPlans"))
                  : errors.name?.message
                    ? helper(errors.name.message, "error")
                    : null}
            </FormGroup>
            <FormGroup
              label={t("terms.description")}
              fieldId="plan-description"
            >
              <TextArea
                id="plan-description"
                value={description}
                onChange={(_event, value) =>
                  setValue("description", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                rows={3}
                resizeOrientation="vertical"
                validated={errors.description ? "error" : "default"}
              />
              {errors.description?.message
                ? helper(errors.description.message, "error")
                : helper(t("agentic.plan.descriptionHelper"))}
            </FormGroup>
          </Form>
        </WizardStep>

        <WizardStep
          id={PATH_STEP_ID}
          name={stepNames[PATH_STEP_ID]}
          footer={{ isNextDisabled: !isPathValid }}
        >
          <Form onSubmit={(event) => event.preventDefault()}>
            <Content component="p" className={textStyles.textColorSubtle}>
              {plan && isPathAssigned
                ? t("agentic.plan.pathIntroAssigned")
                : t("agentic.plan.pathIntro")}
            </Content>
            <FormGroup
              label={t("terms.archetype")}
              isRequired
              fieldId="plan-archetype"
            >
              <Select
                id="plan-archetype-select"
                popperProps={{ appendTo: appendToModal }}
                isScrollable
                maxMenuHeight="16rem"
                isOpen={isArchetypeSelectOpen}
                onOpenChange={setIsArchetypeSelectOpen}
                selected={archetypeId?.toString()}
                onSelect={(_event, value) => {
                  if (Number(value) !== archetypeId) {
                    setValue("archetypeId", Number(value), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue("targetProfileIds", [], {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                  setIsArchetypeSelectOpen(false);
                }}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    id="plan-archetype"
                    onClick={() =>
                      setIsArchetypeSelectOpen(!isArchetypeSelectOpen)
                    }
                    isExpanded={isArchetypeSelectOpen}
                    isDisabled={
                      isLoadingArchetypes || archetypesFetchError != null
                    }
                    isFullWidth
                  >
                    {selectedArchetype?.name ||
                      t("agentic.plan.selectArchetype")}
                  </MenuToggle>
                )}
              >
                <SelectList aria-label={t("terms.archetypes")}>
                  {[...archetypes]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((archetype) => (
                      <SelectOption
                        key={archetype.id}
                        value={archetype.id.toString()}
                      >
                        {archetype.name}
                      </SelectOption>
                    ))}
                </SelectList>
              </Select>
              {archetypesFetchError != null
                ? helper(t("agentic.plan.archetypesLoadFailed"), "error")
                : isLoadingArchetypes
                  ? helper(t("agentic.plan.loadingArchetypes"))
                  : archetypeId != null
                    ? helper(t("agentic.plan.archetypeHelper"))
                    : null}
            </FormGroup>
            <FormGroup
              label={t("terms.targetProfiles")}
              isRequired
              fieldId="plan-target-profiles-input"
            >
              <MultiSelect
                toggleId="plan-target-profiles"
                toggleAriaLabel={t("agentic.plan.selectTargetProfiles")}
                ariaLabel={t("terms.targetProfiles")}
                values={targetProfileIds.map(String)}
                options={targetProfiles.map((profile) => ({
                  value: String(profile.id),
                  label: profile.name,
                }))}
                isDisabled={selectedArchetype == null}
                hasCheckbox
                hasChips
                onSelect={(selection) => {
                  const selectedId = Number(selection);
                  if (selection == null || Number.isNaN(selectedId)) return;
                  setValue(
                    "targetProfileIds",
                    targetProfileIds.includes(selectedId)
                      ? targetProfileIds.filter((id) => id !== selectedId)
                      : [...targetProfileIds, selectedId],
                    { shouldDirty: true, shouldValidate: true }
                  );
                }}
                onClear={() =>
                  setValue("targetProfileIds", [], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                placeholderText={t("agentic.plan.selectTargetProfiles")}
              />
              {helper(
                selectedArchetype == null
                  ? t("agentic.plan.selectArchetypeFirst")
                  : t("agentic.plan.targetProfilesHelper")
              )}
            </FormGroup>
          </Form>
        </WizardStep>

        <WizardStep
          id={STAGES_STEP_ID}
          name={stepNames[STAGES_STEP_ID]}
          footer={{ isNextDisabled: !isStagesValid }}
        >
          <Stack hasGutter>
            <StackItem>
              <Content component="p" className={textStyles.textColorSubtle}>
                {t("agentic.plan.stagesDescription")}
              </Content>
            </StackItem>
            {stages.map((stage, index) => (
              <StackItem key={stage.formKey}>
                <StageCard
                  stage={stage}
                  agents={loadedAgents}
                  isLoadingAgents={isLoadingAgents}
                  models={loadedModels}
                  isExpanded={expandedStageKeys.includes(stage.formKey)}
                  onExpand={() => toggleStage(stage.formKey)}
                  onChange={(updated) =>
                    setStages(
                      stages.map((candidate, candidateIndex) =>
                        candidateIndex === index ? updated : candidate
                      )
                    )
                  }
                  onRemove={() =>
                    setStages(stages.filter((_, i) => i !== index))
                  }
                  onMoveUp={() => moveStage(index, index - 1)}
                  onMoveDown={() => moveStage(index, index + 1)}
                  canRemove={stages.length > 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < stages.length - 1}
                  menuAppendTo={appendToModal}
                />
              </StackItem>
            ))}
            <StackItem>
              <Button
                variant="link"
                isInline
                icon={<PlusCircleIcon />}
                onClick={addStage}
              >
                {t("agentic.plan.addStage")}
              </Button>
            </StackItem>
          </Stack>
        </WizardStep>

        <WizardStep
          id="step-review"
          name={t("agentic.plan.reviewStep")}
          footer={{
            nextButtonText: plan ? t("actions.save") : t("actions.create"),
            isNextDisabled: isSaving || !areOptionsLoaded,
            onNext: () =>
              void handleSubmit(submitPlan, (invalid) =>
                setInvalidStepId(firstInvalidStep(invalid) ?? DETAILS_STEP_ID)
              )(),
          }}
        >
          <PlanSections>
            {invalidStepId != null && (
              <InvalidStepAlert
                stepId={invalidStepId}
                stepName={stepNames[invalidStepId]}
              />
            )}
            <Content component="p" className={textStyles.textColorSubtle}>
              {plan
                ? t("agentic.plan.reviewEdit")
                : t("agentic.plan.reviewCreate")}
            </Content>
            <DescriptionList
              isHorizontal
              isCompact
              horizontalTermWidthModifier={{ default: "18ch" }}
            >
              <DescriptionListGroup>
                <DescriptionListTerm>{t("terms.name")}</DescriptionListTerm>
                <DescriptionListDescription>
                  {trimmedName}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("terms.description")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {(description || "").trim() || (
                    <EmptyTextMessage message={t("terms.none")} />
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("terms.archetype")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {!areArchetypesLoaded
                    ? archetypesState
                    : (selectedArchetype?.name ?? (
                        <EmptyTextMessage message={t("terms.none")} />
                      ))}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {t("terms.targetProfiles")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {!areArchetypesLoaded ? (
                    archetypesState
                  ) : selectedTargetProfiles.length > 0 ? (
                    selectedTargetProfiles
                      .map((profile) => profile.name)
                      .join(", ")
                  ) : (
                    <EmptyTextMessage message={t("terms.none")} />
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
            <PlanSection title={t("agentic.plan.stages")}>
              <StagesTable
                aria-label={t("agentic.plan.stagesToReview")}
                rows={stages.map((stage) => ({
                  key: stage.formKey,
                  name: stage.name,
                  agentId: stage.agentId,
                  instructions: stage.instructions,
                  requiresApproval: stage.requiresApproval,
                }))}
                agents={loadedAgents}
                models={loadedModels}
                isLoading={isLoadingAgents || isLoadingModels}
              />
            </PlanSection>
          </PlanSections>
        </WizardStep>
      </Wizard>
    </Modal>
  );
};
