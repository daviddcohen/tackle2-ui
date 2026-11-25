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
  Modal,
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

import { DevPaths } from "@app/Paths";
import {
  EntityId,
  EntityRef,
  MigrationPlan,
  MigrationPlanRequest,
  ResolvePlanSkillsRequest,
} from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  planSkillsState,
  useCreateMigrationPlanMutation,
  useFetchAgents,
  useFetchGateways,
  useFetchMigrationPlans,
  useResolvePlanSkills,
  useUpdateMigrationPlanMutation,
} from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { DetailSection, DetailSections } from "../../components/detail-section";
import { StageCard, StageFormData } from "../components/stage-card";
import { StagesTable } from "../components/stages-table";

import {
  DraftStageTitle,
  PlanSkillsStep,
  PlanSkillsSummary,
  draftSkills,
} from "./plan-skills-step";

interface PlanWizardProps {
  isOpen: boolean;
  plan: MigrationPlan | null;
  onClose: () => void;
}

interface PlanFormValues {
  name: string;
  description: string;
  stages: StageFormData[];
  /** Skills excluded from every stage; kept when the stages change. */
  excludedSkillIds: EntityId[];
}

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;

/** The menus inside the wizard are appended here. */
const MODAL_ID = "plan-wizard";

const DETAILS_STEP_ID = "step-plan-details";
const STAGES_STEP_ID = "step-stages";
const SKILLS_STEP_ID = "step-skills";
type EditableStepId = typeof DETAILS_STEP_ID | typeof STAGES_STEP_ID;

/** The first wizard step that holds an invalid field, if any. */
const firstInvalidStep = (
  errors: FieldErrors<PlanFormValues>
): EditableStepId | undefined => {
  if (errors.name != null || errors.description != null) {
    return DETAILS_STEP_ID;
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

/**
 * The create toast's next step: a new plan is used by no target profile, and
 * plans are assigned on an archetype's target profiles page.
 */
const AssignPlanToastMessage: React.FC = () => {
  const { t } = useTranslation();
  const link = useLinkComponent(DevPaths.archetypes);
  return (
    <>
      {t("agentic.plan.createdAssignHint")}{" "}
      <Button variant="link" isInline component={link}>
        {t("agentic.execution.goToArchetypes")}
      </Button>
    </>
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
 * Create or edit a migration plan in four steps:
 * Plan details, Stages, Skills, Review. Next
 * stays disabled until the step is valid, and every control that blocks it
 * says why (the Skills step never blocks it). Creating visits the steps in
 * order; editing can open any step.
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
  const loadedAgents =
    isLoadingAgents || agentsFetchError != null ? undefined : agents;
  const loadedModels =
    isLoadingModels || modelsFetchError != null ? undefined : gateways;
  const arePlansLoaded = !isLoadingPlans && plansFetchError == null;

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
        excludedSkillIds: array().of(string().required()).required(),
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
      stages: [emptyStage(1)],
      excludedSkillIds: [],
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const name = useWatch({ control, name: "name" });
  const description = useWatch({ control, name: "description" });
  const stages = useWatch({ control, name: "stages" });
  const excludedSkillIds = useWatch({ control, name: "excludedSkillIds" });

  // The draft's skills come from the server. The request holds only what
  // decides the skills, not the exclusions: the checkboxes read the form, so
  // clearing one refetches nothing. Archetype and target profile skills come
  // from the target profiles that use the plan: an edit previews with them,
  // a new plan has none.
  const skillsRequest = React.useMemo<ResolvePlanSkillsRequest>(
    () => ({
      stages: stages.flatMap((stage) =>
        stage.agentId != null ? [{ agent: { id: stage.agentId } }] : []
      ),
      targetProfiles: (plan?.migrationPaths ?? []).map(({ targetProfile }) => ({
        id: targetProfile.id,
      })),
    }),
    [stages, plan]
  );
  const usedByCount = plan?.migrationPaths?.length ?? 0;
  const hasTargetProfiles = usedByCount > 0;
  const skillsQuery = useResolvePlanSkills(skillsRequest, { enabled: isOpen });
  // The request's stages by position, numbered and named as in the form.
  const stageTitles = React.useMemo<DraftStageTitle[]>(
    () =>
      stages.flatMap((stage, index) =>
        stage.agentId != null
          ? [{ order: index + 1, name: stage.name.trim() }]
          : []
      ),
    [stages]
  );
  const setSkillIncluded = (skill: EntityRef, included: boolean) =>
    setValue(
      "excludedSkillIds",
      included
        ? excludedSkillIds.filter((id) => id !== skill.id)
        : [...excludedSkillIds.filter((id) => id !== skill.id), skill.id],
      { shouldDirty: true }
    );

  // Step that blocked the last submit; cleared when the wizard reopens.
  const [invalidStepId, setInvalidStepId] = React.useState<EditableStepId>();
  // Stage cards that are open: new stages open, existing ones start closed (4.5).
  const [expandedStageKeys, setExpandedStageKeys] = React.useState<string[]>(
    []
  );

  // The plan the form was last filled from while open: a refetch hands a new
  // object for the same plan and must not discard unsaved edits.
  const filledFromRef = React.useRef<string>();
  React.useEffect(() => {
    if (!isOpen) {
      filledFromRef.current = undefined;
      return;
    }
    const filledFrom = plan?.id ?? "";
    if (filledFromRef.current === filledFrom) {
      return;
    }
    filledFromRef.current = filledFrom;
    setInvalidStepId(undefined);
    if (plan) {
      reset({
        name: plan.name,
        description: plan.description,
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
        excludedSkillIds: (plan.excludedSkills ?? []).map((skill) => skill.id),
      });
      setExpandedStageKeys([]);
    } else {
      const first = emptyStage(1);
      reset({
        name: "",
        description: "",
        stages: [first],
        excludedSkillIds: [],
      });
      setExpandedStageKeys([first.formKey]);
    }
  }, [plan, isOpen, reset]);

  const onSuccess = () => {
    pushNotification({
      title: plan ? t("agentic.plan.updated") : t("agentic.plan.created"),
      message: plan ? undefined : <AssignPlanToastMessage />,
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
      stages: submittedStages,
      excludedSkillIds: submittedExcludedSkillIds,
    } = formValues;
    // Only exclusions of skills in the latest resolution are saved, so none
    // pile up unseen. Without a resolution (loading or failed) they are sent
    // as they are.
    const resolvedSkills =
      planSkillsState(skillsQuery) === "ready" &&
      skillsQuery.skillsByStage != null
        ? draftSkills(skillsQuery.skillsByStage)
        : undefined;
    const excludedSkills =
      resolvedSkills != null
        ? submittedExcludedSkillIds.filter((id) =>
            resolvedSkills.some((skill) => skill.id === id)
          )
        : submittedExcludedSkillIds;
    // An edit that clears every exclusion sends an empty list, so a backend
    // that merges updates drops the stored ones.
    const sendsExclusions =
      excludedSkills.length > 0 || (plan?.excludedSkills ?? []).length > 0;
    // Server-owned fields (ids of new stages, effective skills, impact) are
    // not sent; existing stages keep their ids so plan runs stay linked.
    const payload: MigrationPlanRequest = {
      name: submittedName.trim(),
      description: submittedDescription.trim(),
      stages: submittedStages
        .filter((s) => s.agentId != null)
        .map((s) => ({
          id: s.id,
          name: s.name,
          agent: { id: s.agentId ?? "" },
          instructions: s.instructions,
          requiresApproval: s.requiresApproval,
        })),
      ...(sendsExclusions
        ? { excludedSkills: excludedSkills.map((id) => ({ id })) }
        : {}),
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
    // The duplicate check needs every plan.
    arePlansLoaded &&
    !isDuplicateName(name);
  // A saved stage agent is only confirmed once its options load.
  const isStagesValid =
    loadedAgents != null &&
    (stages || []).length > 0 &&
    stages.every((s) => s.name.trim() && s.agentId != null);
  // Editing can open Review directly: it cannot state names it has not loaded.
  const areOptionsLoaded = arePlansLoaded && loadedAgents != null;

  const stepNames: Record<EditableStepId, string> = {
    [DETAILS_STEP_ID]: t("agentic.plan.detailsStep"),
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
            {/* As Models: an edit applies to every target profile that uses the plan. */}
            {usedByCount > 0 && (
              <Alert
                isInline
                isPlain
                variant="warning"
                title={t("agentic.plan.usedByTargetProfiles", {
                  count: usedByCount,
                })}
              />
            )}
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

        <WizardStep id={SKILLS_STEP_ID} name={t("agentic.plan.skillsStep")}>
          <PlanSkillsStep
            query={skillsQuery}
            stageTitles={stageTitles}
            hasTargetProfiles={hasTargetProfiles}
            excludedIds={excludedSkillIds}
            onIncludeChange={setSkillIncluded}
            isEdit={plan != null}
          />
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
          <DetailSections>
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
                  {t("agentic.plan.reviewExcludedSkills")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <PlanSkillsSummary
                    query={skillsQuery}
                    stageTitles={stageTitles}
                    excludedIds={excludedSkillIds}
                    savedExcluded={
                      plan != null ? (plan.excludedSkills ?? []) : undefined
                    }
                  />
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
            <DetailSection title={t("agentic.plan.stages")}>
              <StagesTable
                aria-label={t("agentic.plan.stagesToReview")}
                // Shown over the plan page, whose tables use 0 and 100.
                rowIndexOffset={200}
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
            </DetailSection>
          </DetailSections>
        </WizardStep>
      </Wizard>
    </Modal>
  );
};
