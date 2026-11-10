import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { FieldErrors, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, boolean, number, object, string } from "yup";
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  List,
  ListItem,
  MenuToggle,
  Modal,
  Select,
  SelectList,
  SelectOption,
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

import { MigrationPlan, MigrationPlanRequest } from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  useCreateMigrationPlanMutation,
  useFetchAgents,
  useFetchMigrationPlans,
  useUpdateMigrationPlanMutation,
} from "@app/queries/agentic";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { StageCard, StageFormData } from "../components/stage-card";

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

const DETAILS_STEP_ID = "step-plan-details";
const STAGES_STEP_ID = "step-stages";

/** The first wizard step that holds an invalid field, if any. */
const firstInvalidStep = (
  errors: FieldErrors<PlanFormValues>
): typeof DETAILS_STEP_ID | typeof STAGES_STEP_ID | undefined => {
  if (
    errors.name != null ||
    errors.description != null ||
    errors.archetypeId != null ||
    errors.targetProfileIds != null
  ) {
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
  stepId: typeof DETAILS_STEP_ID | typeof STAGES_STEP_ID;
  stepName: string;
}> = ({ stepId, stepName }) => {
  const { t } = useTranslation();
  const { goToStepById } = useWizardContext();
  return (
    <Alert
      isInline
      variant="danger"
      className="pf-v6-u-mb-md"
      title={t("agentic.plan.validation.invalidStep", { step: stepName })}
      actionLinks={
        <Button variant="link" isInline onClick={() => goToStepById(stepId)}>
          {t("agentic.plan.validation.goToStep", { step: stepName })}
        </Button>
      }
    />
  );
};

const emptyStage = (order: number): StageFormData => ({
  name: "",
  agentId: null,
  instructions: "",
  requiresApproval: false,
  order,
});

export const PlanWizard: React.FC<PlanWizardProps> = ({
  isOpen,
  plan,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { agents } = useFetchAgents();
  const { migrationPlans } = useFetchMigrationPlans();
  const { archetypes } = useFetchArchetypes(false);

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
            (value) =>
              !migrationPlans.some(
                (migrationPlan) =>
                  migrationPlan.id !== plan?.id &&
                  migrationPlan.name.trim().toLocaleLowerCase() ===
                    (value || "").trim().toLocaleLowerCase()
              )
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
              agentId: string().nullable().required(),
              instructions: string().defined(),
              requiresApproval: boolean().required(),
              order: number().required(),
            })
          )
          .min(1)
          .required(),
      }),
    [migrationPlans, plan, t]
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
  const [invalidStepId, setInvalidStepId] = React.useState<
    typeof DETAILS_STEP_ID | typeof STAGES_STEP_ID | undefined
  >();
  const [isTargetProfileSelectOpen, setIsTargetProfileSelectOpen] =
    React.useState(false);

  React.useEffect(() => {
    setInvalidStepId(undefined);
    if (plan) {
      reset({
        name: plan.name,
        description: plan.description,
        archetypeId: plan.migrationPath?.archetype.id ?? null,
        targetProfileIds:
          plan.migrationPath?.targetProfiles.map((profile) => profile.id) ?? [],
        stages: plan.stages.map((s) => ({
          id: s.id,
          name: s.name,
          agentId: s.agent?.id ?? null,
          instructions: s.instructions,
          requiresApproval: s.requiresApproval,
          order: s.order,
        })),
      });
    } else {
      reset({
        name: "",
        description: "",
        archetypeId: null,
        targetProfileIds: [],
        stages: [emptyStage(1)],
      });
    }
  }, [plan, isOpen, reset]);

  const onSuccess = () => {
    pushNotification({
      title: plan
        ? t("agentic.plan.updated", { plan: name })
        : t("agentic.plan.created", { plan: name }),
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
      archetypeId: submittedArchetypeId,
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
        submittedArchetypeId != null && submittedTargetProfileIds.length > 0
          ? {
              archetype: { id: submittedArchetypeId },
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

  const addStage = () => {
    setValue("stages", [...stages, emptyStage(stages.length + 1)], {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const removeStage = (index: number) => {
    const updated = stages.filter((_, i) => i !== index);
    setValue(
      "stages",
      updated.map((s, i) => ({ ...s, order: i + 1 })),
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const updateStage = (index: number, data: StageFormData) => {
    const updated = [...stages];
    updated[index] = data;
    setValue("stages", updated, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const moveStage = (index: number, destination: number) => {
    if (destination < 0 || destination >= stages.length) return;
    const updated = [...stages];
    const [movedStage] = updated.splice(index, 1);
    updated.splice(destination, 0, movedStage);
    setValue(
      "stages",
      updated.map((stage, stageIndex) => ({
        ...stage,
        order: stageIndex + 1,
      })),
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const hasDuplicateName = migrationPlans.some(
    (migrationPlan) =>
      migrationPlan.id !== plan?.id &&
      migrationPlan.name.trim().toLocaleLowerCase() ===
        (name || "").trim().toLocaleLowerCase()
  );
  const isStep1Valid =
    (name || "").trim().length > 0 &&
    (name || "").trim().length <= NAME_MAX_LENGTH &&
    (description || "").length <= DESCRIPTION_MAX_LENGTH &&
    !hasDuplicateName &&
    archetypeId != null &&
    targetProfileIds.length > 0;
  const isStep2Valid =
    (stages || []).length > 0 &&
    stages.every((s) => s.name.trim() && s.agentId != null);

  const selectedArchetype = archetypes.find((a) => a.id === archetypeId);
  const targetProfiles = selectedArchetype?.profiles ?? [];
  const selectedTargetProfiles = targetProfiles.filter((profile) =>
    targetProfileIds.includes(profile.id)
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      aria-label={t("agentic.plan.wizardAriaLabel")}
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
        isVisitRequired
      >
        {/* Step 1: Plan Details */}
        <WizardStep
          id={DETAILS_STEP_ID}
          name={t("agentic.plan.detailsStep")}
          footer={{
            isBackHidden: true,
            isNextDisabled: !isStep1Valid,
          }}
        >
          <Stack hasGutter>
            <StackItem>
              <FormGroup label={t("terms.name")} isRequired fieldId="plan-name">
                <TextInput
                  id="plan-name"
                  isRequired
                  value={name}
                  onChange={(_event, value) =>
                    setValue("name", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  placeholder={t("agentic.plan.namePlaceholder")}
                  validated={errors.name ? "error" : "default"}
                />
                {errors.name?.message && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {errors.name.message}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </StackItem>
            <StackItem>
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
                  placeholder={t("agentic.plan.descriptionPlaceholder")}
                  rows={3}
                  validated={errors.description ? "error" : "default"}
                />
                {errors.description?.message && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {errors.description.message}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </StackItem>
            <StackItem>
              <FormGroup
                label={t("agentic.plan.archetype")}
                isRequired
                fieldId="plan-archetype"
              >
                <Select
                  id="plan-archetype"
                  // Inline, so the menu stays inside the modal (PF marks the rest of
                  // <body> aria-hidden while a modal is open).
                  popperProps={{ appendTo: "inline" }}
                  isOpen={isArchetypeSelectOpen}
                  onOpenChange={setIsArchetypeSelectOpen}
                  selected={archetypeId?.toString()}
                  onSelect={(_event, value) => {
                    setValue("archetypeId", Number(value), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue("targetProfileIds", [], {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setIsArchetypeSelectOpen(false);
                  }}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() =>
                        setIsArchetypeSelectOpen(!isArchetypeSelectOpen)
                      }
                      isExpanded={isArchetypeSelectOpen}
                      isFullWidth
                    >
                      {selectedArchetype?.name ||
                        t("agentic.plan.selectArchetype")}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {archetypes.map((arch) => (
                      <SelectOption key={arch.id} value={arch.id.toString()}>
                        {arch.name}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </FormGroup>
            </StackItem>
            <StackItem>
              <FormGroup
                label={t("agentic.plan.targetProfile")}
                isRequired
                fieldId="plan-target"
              >
                <Select
                  id="plan-target"
                  // Inline, so the menu stays inside the modal (PF marks the rest of
                  // <body> aria-hidden while a modal is open).
                  popperProps={{ appendTo: "inline" }}
                  isOpen={isTargetProfileSelectOpen}
                  onOpenChange={setIsTargetProfileSelectOpen}
                  selected={targetProfileIds}
                  onSelect={(_event, value) => {
                    const selectedId = Number(value);
                    setValue(
                      "targetProfileIds",
                      targetProfileIds.includes(selectedId)
                        ? targetProfileIds.filter((id) => id !== selectedId)
                        : [...targetProfileIds, selectedId],
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      }
                    );
                  }}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      isFullWidth
                      isDisabled={!selectedArchetype}
                      onClick={() =>
                        setIsTargetProfileSelectOpen(!isTargetProfileSelectOpen)
                      }
                      isExpanded={isTargetProfileSelectOpen}
                    >
                      {selectedTargetProfiles.length > 0
                        ? t("agentic.plan.targetProfilesSelected", {
                            count: selectedTargetProfiles.length,
                          })
                        : t("agentic.plan.selectTargetProfiles")}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {targetProfiles.map((profile) => (
                      <SelectOption
                        key={profile.id}
                        value={profile.id}
                        hasCheckbox
                        isSelected={targetProfileIds.includes(profile.id)}
                      >
                        {profile.name}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </FormGroup>
            </StackItem>
          </Stack>
        </WizardStep>

        {/* Step 2: Stages */}
        <WizardStep
          id={STAGES_STEP_ID}
          name={t("agentic.plan.stages")}
          footer={{
            isNextDisabled: !isStep2Valid,
          }}
        >
          <Stack hasGutter>
            {stages.map((stage, index) => (
              <StackItem key={index}>
                <StageCard
                  stage={stage}
                  agents={agents}
                  onChange={(updated) => updateStage(index, updated)}
                  onRemove={() => removeStage(index)}
                  onMoveUp={() => moveStage(index, index - 1)}
                  onMoveDown={() => moveStage(index, index + 1)}
                  canRemove={stages.length > 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < stages.length - 1}
                />
              </StackItem>
            ))}
            <StackItem>
              <Button
                variant="link"
                icon={<PlusCircleIcon />}
                onClick={addStage}
              >
                {t("agentic.plan.addStage")}
              </Button>
            </StackItem>
          </Stack>
        </WizardStep>

        {/* Step 3: Review */}
        <WizardStep
          id="step-review"
          name={t("agentic.plan.reviewStep")}
          footer={{
            nextButtonText: plan
              ? t("agentic.plan.saveChanges")
              : t("agentic.plan.createTitle"),
            isNextDisabled: isSaving,
            onNext: () =>
              void handleSubmit(submitPlan, (invalid) =>
                setInvalidStepId(firstInvalidStep(invalid) ?? DETAILS_STEP_ID)
              )(),
          }}
        >
          {invalidStepId != null && (
            <InvalidStepAlert
              stepId={invalidStepId}
              stepName={
                invalidStepId === DETAILS_STEP_ID
                  ? t("agentic.plan.detailsStep")
                  : t("agentic.plan.stages")
              }
            />
          )}
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("terms.name")}</DescriptionListTerm>
              <DescriptionListDescription>
                {name || t("agentic.plan.notConfigured")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("terms.description")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {description || t("agentic.plan.notConfigured")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.plan.archetype")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {selectedArchetype?.name || t("agentic.plan.notConfigured")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.plan.targetProfile")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {selectedTargetProfiles.length > 0
                  ? selectedTargetProfiles
                      .map((profile) => profile.name)
                      .join(", ")
                  : t("agentic.plan.notConfigured")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t("agentic.plan.stages")}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {stages.length > 0 ? (
                  <List isPlain>
                    {stages.map((s, i) => (
                      <ListItem key={i}>
                        <Label isCompact>{`${i + 1}`}</Label>{" "}
                        {s.name || t("agentic.plan.untitledStage")},{" "}
                        {agents.find((a) => a.id === s.agentId)?.name ||
                          t("agentic.plan.noAgent")}
                        {s.requiresApproval && (
                          <Label
                            isCompact
                            color="orange"
                            className="pf-v6-u-ml-sm"
                          >
                            {t("agentic.plan.approvalRequired")}
                          </Label>
                        )}
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  t("agentic.plan.notConfigured")
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </WizardStep>
      </Wizard>
    </Modal>
  );
};
