import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, mixed, object, string } from "yup";
import {
  ActionGroup,
  Button,
  ButtonVariant,
  Divider,
  Form,
  FormSelect,
  FormSelectOption,
  Stack,
  StackItem,
} from "@patternfly/react-core";

import { Agent, AgentRequest, EntityId } from "@app/agentic";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  useCreateAgentMutation,
  useFetchAgents,
  useFetchGateways,
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateAgentMutation,
} from "@app/queries/agentic";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

type ParameterType = "string" | "number" | "boolean";
const PARAMETER_TYPES: ParameterType[] = ["string", "number", "boolean"];

/** A default value must parse as the parameter's declared type (empty means no default). */
export const isValidParameterDefault = (
  type: ParameterType,
  value: string
): boolean => {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (type === "number") return Number.isFinite(Number(trimmed));
  if (type === "boolean") return trimmed === "true" || trimmed === "false";
  return true;
};

/** Index of the first parameter whose name repeats an earlier one (case-insensitive), or -1. */
export const findDuplicateParameterIndex = (
  parameters: { name?: string }[]
): number => {
  const seen = new Set<string>();
  return parameters.findIndex(({ name }) => {
    const key = (name ?? "").trim().toLowerCase();
    if (key === "") return false;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
};

/** Relationships are held by id; names are only rendered from the options. */
interface FormValues {
  name: string;
  description: string;
  model: EntityId;
  skills: EntityId[];
  skillCollections: EntityId[];
  prompt: string;
  capabilities: string;
  parameters: {
    name: string;
    type: ParameterType;
    description: string;
    defaultValue: string;
  }[];
}

export interface AgentFormProps {
  agent: Agent | null;
  onClose: () => void;
}

export const AgentForm: React.FC<AgentFormProps> = ({ agent, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);

  const { agents } = useFetchAgents();
  const { gateways } = useFetchGateways();
  const { skills: availableSkills } = useFetchSkills();
  const { skillCollections: availableSkillCollections } =
    useFetchSkillCollections();

  const onCreateSuccess = () => {
    pushNotification({
      title: t("agentic.agent.created"),
      variant: "success",
    });
    onClose();
  };

  const onCreateError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.agent.createFailed"),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const onUpdateSuccess = () => {
    pushNotification({
      title: t("agentic.agent.updated"),
      variant: "success",
    });
    onClose();
  };

  const onUpdateError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.agent.updateFailed"),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: createAgent, isPending: isCreating } = useCreateAgentMutation(
    onCreateSuccess,
    onCreateError
  );

  const { mutate: updateAgent, isPending: isUpdating } = useUpdateAgentMutation(
    onUpdateSuccess,
    onUpdateError
  );
  const isSaving = isCreating || isUpdating;

  // Verified Models, plus the Agent's current Model so an edit never loses it.
  const gatewayOptions: FilterSelectOptionProps[] = gateways
    .filter(
      (gateway) =>
        gateway.verificationStatus === "verified" ||
        gateway.id === agent?.model.id
    )
    .map((gateway) => ({
      value: gateway.id,
      label: t("agentic.agent.modelOption", {
        model: gateway.name,
        provider: gateway.provider.name,
      }),
    }));

  const skillOptions: FilterSelectOptionProps[] = availableSkills.map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const skillCollectionOptions: FilterSelectOptionProps[] =
    availableSkillCollections.map((collection) => ({
      value: collection.id,
      label: collection.name,
    }));

  const validationSchema = object().shape({
    name: string()
      .trim()
      .required(t("agentic.agent.validation.nameRequired"))
      .min(3, t("agentic.agent.validation.nameMinimum"))
      .max(120, t("agentic.agent.validation.nameMaximum"))
      .test(
        "Duplicate name",
        t("agentic.agent.validation.nameDuplicate"),
        (value) => duplicateNameCheck(agents || [], agent || null, value || "")
      ),
    description: string()
      .trim()
      .max(500, t("agentic.agent.validation.descriptionMaximum")),
    model: string().required(t("agentic.agent.validation.modelRequired")),
    skills: array().of(string().required()).defined(),
    skillCollections: array().of(string().required()).defined(),
    prompt: string().trim(),
    capabilities: string().defined(),
    parameters: array()
      .of(
        object({
          name: string()
            .trim()
            .required(t("agentic.agent.validation.parameterNameRequired")),
          type: mixed<ParameterType>().oneOf(PARAMETER_TYPES).required(),
          description: string().defined(),
          defaultValue: string()
            .defined()
            .test(
              "typed-default",
              t("agentic.agent.validation.parameterDefaultType"),
              function (value) {
                const type: ParameterType = this.parent?.type ?? "string";
                return isValidParameterDefault(type, value ?? "");
              }
            ),
        })
      )
      .defined()
      .test(
        "unique-parameter-names",
        t("agentic.agent.validation.parameterNameDuplicate"),
        function (parameters) {
          const index = findDuplicateParameterIndex(parameters ?? []);
          return index === -1
            ? true
            : this.createError({
                path: `${this.path}[${index}].name`,
                message: t("agentic.agent.validation.parameterNameDuplicate"),
              });
        }
      ),
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isValidating, isValid, isDirty },
    control,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      name: agent?.name || "",
      description: agent?.description || "",
      model: agent?.model.id || "",
      skills: agent?.skills?.map((s) => s.id) || [],
      skillCollections:
        agent?.skillCollections?.map((collection) => collection.id) || [],
      prompt: agent?.prompt || "",
      capabilities: agent?.capabilities.join("\n") || "",
      parameters:
        agent?.parameters.map((parameter) => ({
          ...parameter,
          defaultValue: parameter.defaultValue || "",
        })) || [],
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const selectedSkills = useWatch({ control, name: "skills" });
  const selectedSkillCollections = useWatch({
    control,
    name: "skillCollections",
  });
  const selectedModel = useWatch({ control, name: "model" });
  const {
    fields: parameterFields,
    append: appendParameter,
    remove: removeParameter,
  } = useFieldArray({ control, name: "parameters" });

  const onSubmit = (formValues: FormValues) => {
    const payload: AgentRequest = {
      name: formValues.name.trim(),
      description: formValues.description.trim(),
      model: { id: formValues.model },
      skills: formValues.skills.map((id) => ({ id })),
      skillCollections: formValues.skillCollections.map((id) => ({ id })),
      prompt: formValues.prompt.trim(),
      capabilities: formValues.capabilities
        .split("\n")
        .map((capability) => capability.trim())
        .filter(Boolean),
      parameters: formValues.parameters.map((parameter) => ({
        ...parameter,
        name: parameter.name.trim(),
        description: parameter.description.trim(),
        defaultValue: parameter.defaultValue.trim() || undefined,
      })),
    };

    if (agent) {
      updateAgent({ id: agent.id, ...payload });
    } else {
      createAgent(payload);
    }
  };

  const handleSkillToggle = (value?: string) => {
    if (!value) return;
    setValue(
      "skills",
      selectedSkills.includes(value)
        ? selectedSkills.filter((skillId) => skillId !== value)
        : [...selectedSkills, value],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const handleSkillCollectionToggle = (value?: string) => {
    if (!value) return;
    setValue(
      "skillCollections",
      selectedSkillCollections.includes(value)
        ? selectedSkillCollections.filter(
            (collectionId) => collectionId !== value
          )
        : [...selectedSkillCollections, value],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <HookFormPFTextInput
        control={control}
        name="name"
        label={t("terms.name")}
        fieldId="agent-name"
        isRequired
      />
      <HookFormPFTextArea
        control={control}
        name="description"
        label={t("terms.description")}
        fieldId="agent-description"
      />
      <HookFormPFGroupController
        control={control}
        name="model"
        label={t("agentic.agent.model")}
        fieldId="agent-gateways"
        isRequired
        helperText={t("agentic.agent.modelHelp")}
        renderInput={() => (
          <TypeaheadSelect
            toggleId="gateway-select-toggle"
            toggleAriaLabel={t("agentic.agent.modelSelect")}
            ariaLabel={t("agentic.agent.model")}
            value={selectedModel}
            options={gatewayOptions}
            onSelect={(value) =>
              setValue("model", value || "", {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            placeholderText={t("agentic.agent.selectModel")}
          />
        )}
      />
      <HookFormPFGroupController
        control={control}
        name="skills"
        label={t("agentic.skill.title")}
        fieldId="agent-skills"
        renderInput={() => (
          <MultiSelect
            toggleId="skills-select-toggle"
            toggleAriaLabel={t("agentic.agent.skillsSelect")}
            ariaLabel={t("agentic.skill.title")}
            values={selectedSkills}
            options={skillOptions}
            hasCheckbox
            hasBadge
            hasChips
            onSelect={(selection) => handleSkillToggle(selection)}
            onClear={() =>
              setValue("skills", [], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            placeholderText={t("agentic.agent.addSkill")}
          />
        )}
      />
      <HookFormPFGroupController
        control={control}
        name="skillCollections"
        label={t("agentic.skillCollection.title")}
        fieldId="agent-skill-collections"
        helperText={t("agentic.agent.skillCollectionsHelp")}
        renderInput={() => (
          <MultiSelect
            toggleId="skill-collections-select-toggle"
            toggleAriaLabel={t("agentic.agent.skillCollectionsSelect")}
            ariaLabel={t("agentic.skillCollection.title")}
            values={selectedSkillCollections}
            options={skillCollectionOptions}
            hasCheckbox
            hasBadge
            hasChips
            onSelect={(selection) => handleSkillCollectionToggle(selection)}
            onClear={() =>
              setValue("skillCollections", [], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            placeholderText={t("agentic.agent.addSkillCollection")}
          />
        )}
      />
      <HookFormPFTextArea
        control={control}
        name="prompt"
        label={t("agentic.agent.personaPrompt")}
        fieldId="agent-prompt"
        helperText={t("agentic.agent.personaPromptHelp")}
      />
      <HookFormPFTextArea
        control={control}
        name="capabilities"
        label={t("agentic.agent.capabilities")}
        fieldId="agent-capabilities"
        helperText={t("agentic.agent.capabilitiesHelp")}
        rows={4}
      />
      <Stack hasGutter>
        <StackItem>
          <strong>{t("agentic.agent.parameters")}</strong>
          <div>{t("agentic.agent.parametersHelp")}</div>
        </StackItem>
        {parameterFields.map((field, index) => (
          <StackItem key={field.id}>
            <Stack hasGutter>
              <HookFormPFTextInput
                control={control}
                name={`parameters.${index}.name`}
                label={t("terms.name")}
                fieldId={`agent-parameter-${index}-name`}
                isRequired
              />
              <HookFormPFGroupController
                control={control}
                name={`parameters.${index}.type`}
                label={t("agentic.agent.parameterType")}
                fieldId={`agent-parameter-${index}-type`}
                renderInput={({ field: { value, onChange } }) => (
                  <FormSelect
                    id={`agent-parameter-${index}-type`}
                    value={value}
                    onChange={(_event, nextValue) => onChange(nextValue)}
                  >
                    {PARAMETER_TYPES.map((type) => (
                      <FormSelectOption
                        key={type}
                        value={type}
                        label={t(`agentic.agent.parameterTypes.${type}`)}
                      />
                    ))}
                  </FormSelect>
                )}
              />
              <HookFormPFTextInput
                control={control}
                name={`parameters.${index}.description`}
                label={t("terms.description")}
                fieldId={`agent-parameter-${index}-description`}
              />
              <HookFormPFTextInput
                control={control}
                name={`parameters.${index}.defaultValue`}
                label={t("agentic.agent.parameterDefault")}
                fieldId={`agent-parameter-${index}-default`}
              />
              <Button
                type="button"
                variant={ButtonVariant.link}
                onClick={() => removeParameter(index)}
              >
                {t("agentic.agent.removeParameter")}
              </Button>
              <Divider />
            </Stack>
          </StackItem>
        ))}
        <StackItem>
          <Button
            type="button"
            variant={ButtonVariant.link}
            onClick={() =>
              appendParameter({
                name: "",
                type: "string",
                description: "",
                defaultValue: "",
              })
            }
          >
            {t("agentic.agent.addParameter")}
          </Button>
        </StackItem>
      </Stack>
      <ActionGroup>
        <Button
          type="submit"
          id="submit"
          variant={ButtonVariant.primary}
          isDisabled={
            !isValid || isSubmitting || isValidating || !isDirty || isSaving
          }
        >
          {!agent ? t("actions.create") : t("actions.save")}
        </Button>
        <Button
          type="button"
          id="cancel"
          variant={ButtonVariant.link}
          isDisabled={isSubmitting || isValidating}
          onClick={onClose}
        >
          {t("actions.cancel")}
        </Button>
      </ActionGroup>
    </Form>
  );
};
