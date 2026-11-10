import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, mixed, object, string } from "yup";
import {
  ActionGroup,
  Button,
  ButtonVariant,
  Form,
  ToggleGroup,
  ToggleGroupItem,
} from "@patternfly/react-core";

import {
  Skill,
  SkillAssociationRequest,
  SkillRequest,
  SkillSourceType,
} from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  useCreateSkillMutation,
  useFetchAgents,
  useFetchMigrationPlans,
  useFetchSkills,
  useUpdateSkillMutation,
} from "@app/queries/agentic";
import { useFetchApplications } from "@app/queries/applications";
import { agentsWriteScopes } from "@app/scopes";
import {
  duplicateNameCheck,
  getAxiosErrorMessage,
  isValidGitUrl,
} from "@app/utils/utils";

interface FormValues {
  name: string;
  description: string;
  sourceType: SkillSourceType;
  content: string;
  repoUrl: string;
  repoBranch: string;
  repoPath: string;
  imageRef: string;
  associationKeys: string[];
}

export interface SkillFormProps {
  skill: Skill | null;
  onClose: () => void;
}

export const SkillForm: React.FC<SkillFormProps> = ({ skill, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);

  const { skills } = useFetchSkills();
  const { agents } = useFetchAgents();
  const { migrationPlans } = useFetchMigrationPlans();
  const { data: applications } = useFetchApplications(false);
  // Associating a Skill with an Agent writes the Agent's skill list, so it
  // needs Agent write access. Without it, the Skill's Agent associations are
  // shown read-only and sent back unchanged.
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);
  const agentAssociationKeys =
    skill?.associations
      ?.filter((association) => association.scope === "agent")
      .map((association) => `agent:${association.resource.id}`) ?? [];
  const readOnlyAgentNames = canManageAgents
    ? []
    : (skill?.associations ?? [])
        .filter((association) => association.scope === "agent")
        .map(
          (association) =>
            agents.find((agent) => agent.id === association.resource.id)
              ?.name ?? association.resource.name
        );

  const associationOptions = React.useMemo<FilterSelectOptionProps[]>(() => {
    const archetypes = new Map<number, string>();
    const targetProfiles = new Map<number, string>();
    migrationPlans.forEach((plan) => {
      const migrationPath = plan.migrationPath;
      if (!migrationPath) return;
      archetypes.set(migrationPath.archetype.id, migrationPath.archetype.name);
      migrationPath.targetProfiles.forEach((profile) =>
        targetProfiles.set(
          profile.id,
          t("agentic.skill.targetProfileOption", {
            profile: profile.name,
            archetype: migrationPath.archetype.name,
          })
        )
      );
    });

    return [
      ...(canManageAgents ? agents : []).map((agent) => ({
        value: `agent:${agent.id}`,
        label: agent.name,
        groupLabel: t("agentic.plan.skillScopes.agent"),
      })),
      ...Array.from(archetypes, ([id, name]) => ({
        value: `archetype:${id}`,
        label: name,
        groupLabel: t("agentic.plan.skillScopes.archetype"),
      })),
      ...Array.from(targetProfiles, ([id, name]) => ({
        value: `targetProfile:${id}`,
        label: name,
        groupLabel: t("agentic.plan.skillScopes.targetProfile"),
      })),
      ...applications
        .filter((application) => application.id != null)
        .map((application) => ({
          value: `application:${application.id}`,
          label: application.name,
          groupLabel: t("agentic.plan.skillScopes.application"),
        })),
    ];
  }, [agents, applications, canManageAgents, migrationPlans, t]);

  const onCreateSuccess = () => {
    pushNotification({
      title: t("agentic.skill.created"),
      variant: "success",
    });
    onClose();
  };

  const onCreateError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.skill.createFailed"),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const onUpdateSuccess = () => {
    pushNotification({
      title: t("agentic.skill.updated"),
      variant: "success",
    });
    onClose();
  };

  const onUpdateError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.skill.updateFailed"),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: createSkill, isPending: isCreating } = useCreateSkillMutation(
    onCreateSuccess,
    onCreateError
  );

  const { mutate: updateSkill, isPending: isUpdating } = useUpdateSkillMutation(
    onUpdateSuccess,
    onUpdateError
  );
  const isSaving = isCreating || isUpdating;

  const validationSchema = object().shape({
    name: string()
      .trim()
      .required(t("agentic.skill.validation.nameRequired"))
      .min(3, t("agentic.skill.validation.nameMinimum"))
      .max(120, t("agentic.skill.validation.nameMaximum"))
      .test(
        "Duplicate name",
        t("agentic.skill.validation.nameDuplicate"),
        (value) => duplicateNameCheck(skills || [], skill || null, value || "")
      ),
    description: string()
      .trim()
      .max(500, t("agentic.skill.validation.descriptionMaximum")),
    sourceType: mixed<SkillSourceType>()
      .oneOf(["inline", "git", "oci"])
      .required(),
    content: string().when("sourceType", {
      is: "inline",
      then: (schema) =>
        schema.trim().required(t("agentic.skill.validation.contentRequired")),
      otherwise: (schema) => schema.optional(),
    }),
    repoUrl: string().when("sourceType", {
      is: "git",
      then: (schema) =>
        schema
          .trim()
          .required(t("agentic.skill.validation.repositoryRequired"))
          .test(
            "git-url",
            t("agentic.skill.validation.repositoryUrl"),
            (value) => value == null || isValidGitUrl(value.trim())
          ),
      otherwise: (schema) => schema.optional(),
    }),
    repoBranch: string().optional(),
    repoPath: string().optional(),
    imageRef: string().when("sourceType", {
      is: "oci",
      then: (schema) =>
        schema.trim().required(t("agentic.skill.validation.imageRequired")),
      otherwise: (schema) => schema.optional(),
    }),
    associationKeys: array().of(string().required()).defined(),
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isValidating, isValid, isDirty },
    control,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      name: skill?.name || "",
      description: skill?.description || "",
      sourceType: skill?.sourceType || "inline",
      content: skill?.content || "",
      repoUrl: skill?.repoUrl || "",
      repoBranch: skill?.repoBranch || "main",
      repoPath: skill?.repoPath || "/",
      imageRef: skill?.imageRef || "",
      associationKeys:
        skill?.associations
          ?.filter(
            (association) => canManageAgents || association.scope !== "agent"
          )
          .map(
            (association) => `${association.scope}:${association.resource.id}`
          ) || [],
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const selectedSourceType = useWatch({ control, name: "sourceType" });
  const selectedAssociationKeys = useWatch({
    control,
    name: "associationKeys",
  });

  const onSubmit = (formValues: FormValues) => {
    // Association keys are "<scope>:<id>"; the server resolves the names.
    const associationKeys = canManageAgents
      ? formValues.associationKeys
      : [...formValues.associationKeys, ...agentAssociationKeys];
    const associations = associationKeys
      .map((key): SkillAssociationRequest | undefined => {
        const separator = key.indexOf(":");
        const scope = key.slice(0, separator);
        const idValue = key.slice(separator + 1);
        if (scope === "agent") {
          return idValue ? { scope, resource: { id: idValue } } : undefined;
        }
        const id = Number(idValue);
        if (
          (scope === "archetype" ||
            scope === "targetProfile" ||
            scope === "application") &&
          Number.isFinite(id)
        ) {
          return { scope, resource: { id } };
        }
        return undefined;
      })
      .filter(
        (association): association is SkillAssociationRequest => !!association
      );
    const payload: SkillRequest = {
      name: formValues.name.trim(),
      description: formValues.description.trim(),
      sourceType: formValues.sourceType,
      content:
        formValues.sourceType === "inline"
          ? formValues.content.trim()
          : undefined,
      repoUrl:
        formValues.sourceType === "git" ? formValues.repoUrl.trim() : undefined,
      repoBranch:
        formValues.sourceType === "git"
          ? formValues.repoBranch.trim() || "main"
          : undefined,
      repoPath:
        formValues.sourceType === "git"
          ? formValues.repoPath.trim() || "/"
          : undefined,
      imageRef:
        formValues.sourceType === "oci"
          ? formValues.imageRef.trim()
          : undefined,
      associations,
    };

    if (skill) {
      updateSkill({ id: skill.id, ...payload });
    } else {
      createSkill(payload);
    }
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <HookFormPFTextInput
        control={control}
        name="name"
        label={t("terms.name")}
        fieldId="skill-name"
        isRequired
      />
      <HookFormPFTextArea
        control={control}
        name="description"
        label={t("terms.description")}
        fieldId="skill-description"
      />
      <HookFormPFGroupController
        control={control}
        name="sourceType"
        label={t("agentic.skill.sourceType")}
        fieldId="skill-source-type"
        isRequired
        renderInput={({ field: { value, onChange } }) => (
          <ToggleGroup aria-label={t("agentic.skill.sourceTypeSelection")}>
            <ToggleGroupItem
              text={t("agentic.skill.sourceTypes.inline")}
              buttonId="source-inline"
              isSelected={value === "inline"}
              onChange={() => onChange("inline")}
            />
            <ToggleGroupItem
              text={t("agentic.skill.sourceTypes.git")}
              buttonId="source-git"
              isSelected={value === "git"}
              onChange={() => onChange("git")}
            />
            <ToggleGroupItem
              text={t("agentic.skill.sourceTypes.oci")}
              buttonId="source-oci"
              isSelected={value === "oci"}
              onChange={() => onChange("oci")}
            />
          </ToggleGroup>
        )}
      />

      {selectedSourceType === "inline" && (
        <HookFormPFTextArea
          control={control}
          name="content"
          label={t("agentic.skill.content")}
          fieldId="skill-content"
          isRequired
          resizeOrientation="vertical"
          aria-label={t("agentic.skill.contentAriaLabel")}
          style={{ fontFamily: "var(--pf-t--global--font--family--mono)" }}
          placeholder={t("agentic.skill.contentPlaceholder")}
          rows={12}
        />
      )}

      {selectedSourceType === "git" && (
        <>
          <HookFormPFTextInput
            control={control}
            name="repoUrl"
            label={t("agentic.skill.repositoryUrl")}
            fieldId="skill-repo-url"
            isRequired
            placeholder={t("agentic.skill.repositoryPlaceholder")}
          />
          <HookFormPFTextInput
            control={control}
            name="repoBranch"
            label={t("agentic.skill.branch")}
            fieldId="skill-repo-branch"
            placeholder={t("agentic.skill.branchPlaceholder")}
          />
          <HookFormPFTextInput
            control={control}
            name="repoPath"
            label={t("agentic.skill.path")}
            fieldId="skill-repo-path"
            placeholder={t("agentic.skill.pathPlaceholder")}
            helperText={t("agentic.skill.pathHelp")}
          />
        </>
      )}

      {selectedSourceType === "oci" && (
        <HookFormPFTextInput
          control={control}
          name="imageRef"
          label={t("agentic.skill.imageReference")}
          fieldId="skill-image-ref"
          isRequired
          placeholder={t("agentic.skill.imagePlaceholder")}
        />
      )}

      <HookFormPFGroupController
        control={control}
        name="associationKeys"
        label={t("agentic.skill.associatedTo")}
        fieldId="skill-associations"
        helperText={
          canManageAgents
            ? t("agentic.skill.associationHelp")
            : readOnlyAgentNames.length > 0
              ? t("agentic.skill.agentAssociationsReadOnly", {
                  agents: readOnlyAgentNames.join(", "),
                })
              : t("agentic.skill.agentAssociationsNotPermitted")
        }
        renderInput={() => (
          <MultiSelect
            toggleId="skill-association-select"
            toggleAriaLabel={t("agentic.skill.associationSelect")}
            ariaLabel={t("agentic.skill.associatedTo")}
            options={associationOptions}
            values={selectedAssociationKeys}
            hasCheckbox
            hasBadge
            hasChips
            onSelect={(value) => {
              if (!value) return;
              const next = selectedAssociationKeys.includes(value)
                ? selectedAssociationKeys.filter((key) => key !== value)
                : [...selectedAssociationKeys, value];
              setValue("associationKeys", next, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            onClear={() =>
              setValue("associationKeys", [], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            placeholderText={t("agentic.skill.selectAssociations")}
          />
        )}
      />

      <ActionGroup>
        <Button
          type="submit"
          id="submit"
          variant={ButtonVariant.primary}
          isDisabled={
            !isValid || isSubmitting || isValidating || !isDirty || isSaving
          }
        >
          {!skill ? t("actions.create") : t("actions.save")}
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
