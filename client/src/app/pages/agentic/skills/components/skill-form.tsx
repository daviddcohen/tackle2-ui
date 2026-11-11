import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, mixed, object, string } from "yup";
import {
  Alert,
  Button,
  ButtonVariant,
  Form,
  FormSection,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextArea,
  ToggleGroup,
  ToggleGroupItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  Skill,
  SkillAssociationRequest,
  SkillAssociationScope,
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
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateSkillMutation,
} from "@app/queries/agentic";
import { useFetchApplications } from "@app/queries/applications";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { agentsWriteScopes } from "@app/scopes";
import {
  duplicateNameCheck,
  getAxiosErrorMessage,
  getValidatedFromErrors,
  isValidGitUrl,
} from "@app/utils/utils";

import { getCollectionsContainingSkill } from "../skill-usage";

const FORM_ID = "skill-form";
const TITLE_ID = "skill-modal-title";

type AssociationField =
  | "agents"
  | "archetypes"
  | "targetProfiles"
  | "applications";

/** One picker per scope, in resolution order (guide 2.3, skills amendment 1). */
const ASSOCIATION_FIELDS: {
  field: AssociationField;
  scope: SkillAssociationScope;
  toggleId: string;
}[] = [
  { field: "agents", scope: "agent", toggleId: "skill-agents" },
  { field: "archetypes", scope: "archetype", toggleId: "skill-archetypes" },
  {
    field: "targetProfiles",
    scope: "targetProfile",
    toggleId: "skill-target-profiles",
  },
  {
    field: "applications",
    scope: "application",
    toggleId: "skill-applications",
  },
];

interface FormValues {
  name: string;
  description: string;
  sourceType: SkillSourceType;
  content: string;
  repoUrl: string;
  repoBranch: string;
  repoPath: string;
  imageRef: string;
  agents: string[];
  archetypes: string[];
  targetProfiles: string[];
  applications: string[];
}

export interface SkillModalProps {
  isOpen: boolean;
  /** The skill to edit; create when null. */
  skill: Skill | null;
  onClose: () => void;
}

/** Create or edit a skill (guide 4.4, skill-create, skill-edit). */
export const SkillModal: React.FC<SkillModalProps> = ({
  isOpen,
  skill,
  onClose,
}) => (
  <Modal
    id="skill-modal"
    variant="medium"
    isOpen={isOpen}
    onClose={onClose}
    aria-labelledby={TITLE_ID}
  >
    {/* mounted only while open, so every opening starts from the skill */}
    {isOpen && <SkillForm skill={skill} onClose={onClose} />}
  </Modal>
);

export interface SkillFormProps {
  skill: Skill | null;
  onClose: () => void;
}

/** The modal's header, body and footer. */
export const SkillForm: React.FC<SkillFormProps> = ({ skill, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);

  const { skills } = useFetchSkills();
  const { agents } = useFetchAgents();
  const { archetypes } = useFetchArchetypes();
  const { data: applications } = useFetchApplications(false);
  const {
    skillCollections,
    isLoading: isLoadingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  // Associating a skill with an agent writes the agent's skills, so the
  // Agents field needs agent write access. Without it the field is disabled
  // and its values are sent back unchanged (S6).
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);

  const idsOf = (scope: SkillAssociationScope) =>
    (skill?.associations ?? [])
      .filter((association) => association.scope === scope)
      .map((association) => String(association.resource.id));

  const options = React.useMemo<
    Record<AssociationField, FilterSelectOptionProps[]>
  >(() => {
    const loaded: Record<AssociationField, FilterSelectOptionProps[]> = {
      agents: agents.map((agent) => ({ value: agent.id, label: agent.name })),
      archetypes: archetypes.map((archetype) => ({
        value: String(archetype.id),
        label: archetype.name,
      })),
      // From the archetypes, so a profile no plan uses is offered too (S5).
      targetProfiles: archetypes.flatMap((archetype) =>
        (archetype.profiles ?? []).map((profile) => ({
          value: String(profile.id),
          label: t("agentic.skill.targetProfileOption", {
            profile: profile.name,
            archetype: archetype.name,
          }),
        }))
      ),
      applications: applications
        .filter((application) => application.id != null)
        .map((application) => ({
          value: String(application.id),
          label: application.name,
        })),
    };
    // A current association keeps its name while the options load.
    for (const { field, scope } of ASSOCIATION_FIELDS) {
      for (const association of skill?.associations ?? []) {
        const value = String(association.resource.id);
        if (
          association.scope === scope &&
          !loaded[field].some((option) => option.value === value)
        ) {
          loaded[field].push({ value, label: association.resource.name });
        }
      }
    }
    return loaded;
  }, [agents, applications, archetypes, skill, t]);

  const notify = (title: string) => () => {
    pushNotification({ title, variant: "success" });
    onClose();
  };
  const notifyError = (title: string) => (error: AxiosError) =>
    pushNotification({
      title,
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });

  const { mutate: createSkill, isPending: isCreating } = useCreateSkillMutation(
    notify(t("agentic.skill.created")),
    notifyError(t("agentic.skill.createFailed"))
  );
  const { mutate: updateSkill, isPending: isUpdating } = useUpdateSkillMutation(
    notify(t("agentic.skill.updated")),
    notifyError(t("agentic.skill.updateFailed"))
  );

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
    agents: array().of(string().required()).defined(),
    archetypes: array().of(string().required()).defined(),
    targetProfiles: array().of(string().required()).defined(),
    applications: array().of(string().required()).defined(),
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
      agents: idsOf("agent"),
      archetypes: idsOf("archetype"),
      targetProfiles: idsOf("targetProfile"),
      applications: idsOf("application"),
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const selectedSourceType = useWatch({ control, name: "sourceType" });

  // The edit warning counts what the delete reason counts (amendment 3, S1),
  // once both counts are known.
  const associationCount = skill?.associations?.length;
  const collectionCount =
    skill == null || isLoadingCollections || collectionsError != null
      ? undefined
      : getCollectionsContainingSkill(skill, skillCollections).length;
  const editWarning = (() => {
    if (associationCount == null || collectionCount == null) {
      return undefined;
    }
    const associations = t("agentic.skill.associationCount", {
      count: associationCount,
    });
    const collections = t("agentic.skill.collectionCount", {
      count: collectionCount,
    });
    if (associationCount > 0 && collectionCount > 0) {
      return t("agentic.skill.editWarning.both", { associations, collections });
    }
    if (associationCount > 0) {
      return t("agentic.skill.editWarning.associationsOnly", { associations });
    }
    if (collectionCount > 0) {
      return t("agentic.skill.editWarning.collectionsOnly", { collections });
    }
    return undefined;
  })();

  const onSubmit = (formValues: FormValues) => {
    const associations: SkillAssociationRequest[] = [
      ...formValues.agents.map(
        (id): SkillAssociationRequest => ({
          scope: "agent",
          resource: { id },
        })
      ),
      ...(
        [
          ["archetype", formValues.archetypes],
          ["targetProfile", formValues.targetProfiles],
          ["application", formValues.applications],
        ] as const
      ).flatMap(([scope, ids]) =>
        ids
          .map(Number)
          .filter(Number.isFinite)
          .map((id): SkillAssociationRequest => ({ scope, resource: { id } }))
      ),
    ];
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

  const isSaving = isCreating || isUpdating;

  return (
    <>
      <ModalHeader
        title={skill ? t("agentic.skill.edit") : t("agentic.skill.create")}
        description={t("agentic.skill.formDescription")}
        labelId={TITLE_ID}
      />
      <ModalBody>
        {editWarning && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title={editWarning}
            className={spacing.mbLg}
          />
        )}
        <Form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <FormSection title={t("terms.general")}>
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
              rows={2}
              resizeOrientation="vertical"
            />
          </FormSection>

          <FormSection title={t("terms.source")}>
            <HookFormPFGroupController
              control={control}
              name="sourceType"
              label={t("agentic.skill.sourceType")}
              fieldId="skill-source-type"
              helperText={t("agentic.skill.sourceTypeHelp")}
              renderInput={({ field: { value, onChange } }) => (
                <ToggleGroup aria-label={t("agentic.skill.sourceType")}>
                  {(["inline", "git", "oci"] as const).map((type) => (
                    <ToggleGroupItem
                      key={type}
                      text={t(`agentic.skill.sourceTypes.${type}`)}
                      buttonId={`source-${type}`}
                      isSelected={value === type}
                      onChange={() => onChange(type)}
                    />
                  ))}
                </ToggleGroup>
              )}
            />

            {selectedSourceType === "inline" && (
              <HookFormPFGroupController
                control={control}
                name="content"
                label={t("agentic.skill.content")}
                fieldId="skill-content"
                helperText={t("agentic.skill.contentHelp")}
                isRequired
                renderInput={({
                  field: { onChange, onBlur, value, name, ref },
                  fieldState: { isDirty: isFieldDirty, error, isTouched },
                }) => (
                  <TextArea
                    ref={ref}
                    name={name}
                    id="skill-content"
                    aria-describedby="skill-content-helper"
                    isRequired
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value}
                    validated={getValidatedFromErrors(
                      error,
                      isFieldDirty,
                      isTouched
                    )}
                    rows={8}
                    resizeOrientation="vertical"
                    className={textStyles.fontFamilyMonospace}
                  />
                )}
              />
            )}

            {selectedSourceType === "git" && (
              <>
                <HookFormPFTextInput
                  control={control}
                  name="repoUrl"
                  label={t("agentic.skill.repositoryUrl")}
                  fieldId="skill-repo-url"
                  helperText={t("agentic.skill.repositoryHelp")}
                  isRequired
                />
                <HookFormPFTextInput
                  control={control}
                  name="repoBranch"
                  label={t("agentic.skill.branch")}
                  fieldId="skill-repo-branch"
                />
                <HookFormPFTextInput
                  control={control}
                  name="repoPath"
                  label={t("agentic.skill.path")}
                  fieldId="skill-repo-path"
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
                helperText={t("agentic.skill.imageHelp")}
                isRequired
              />
            )}
          </FormSection>

          {/* Always visible on create and edit (user decision U1). */}
          <FormSection title={t("agentic.skill.associations")}>
            {ASSOCIATION_FIELDS.map(({ field, toggleId }) => {
              const isDisabled = field === "agents" && !canManageAgents;
              return (
                <HookFormPFGroupController
                  key={field}
                  control={control}
                  name={field}
                  label={t(`agentic.skill.associationFields.${field}.label`)}
                  fieldId={`${toggleId}-input`}
                  helperText={
                    isDisabled
                      ? t("agentic.skill.agentsReadOnly")
                      : t(`agentic.skill.associationFields.${field}.helper`)
                  }
                  renderInput={({ field: { value } }) => (
                    <MultiSelect
                      toggleId={toggleId}
                      toggleAriaLabel={t(
                        `agentic.skill.associationFields.${field}.placeholder`
                      )}
                      ariaLabel={t(
                        `agentic.skill.associationFields.${field}.label`
                      )}
                      options={options[field]}
                      values={value}
                      isDisabled={isDisabled}
                      hasCheckbox
                      hasBadge
                      hasChips
                      onSelect={(selection) => {
                        if (!selection || isDisabled) return;
                        setValue(
                          field,
                          value.includes(selection)
                            ? value.filter((id) => id !== selection)
                            : [...value, selection],
                          { shouldDirty: true, shouldValidate: true }
                        );
                      }}
                      onClear={() => {
                        if (isDisabled) return;
                        setValue(field, [], {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                      placeholderText={t(
                        `agentic.skill.associationFields.${field}.placeholder`
                      )}
                    />
                  )}
                />
              );
            })}
          </FormSection>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={FORM_ID}
          variant={ButtonVariant.primary}
          isDisabled={
            !isValid || isSubmitting || isValidating || !isDirty || isSaving
          }
          isLoading={isSaving || undefined}
        >
          {skill ? t("actions.save") : t("actions.create")}
        </Button>
        <Button
          type="button"
          variant={ButtonVariant.link}
          isDisabled={isSubmitting || isValidating}
          onClick={onClose}
        >
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
