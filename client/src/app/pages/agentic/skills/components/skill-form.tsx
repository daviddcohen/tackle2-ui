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
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
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
  SkillLoadPolicy,
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
  PICKER_MENU_HEIGHT,
  PICKER_MENU_POPPER,
} from "@app/pages/agentic/components/picker-menu";
import {
  useCreateSkillMutation,
  useFetchAgents,
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateSkillCollectionMembershipsMutation,
  useUpdateSkillMutation,
} from "@app/queries/agentic";
import { useFetchApplications } from "@app/queries/applications";
import { useFetchArchetypes } from "@app/queries/archetypes";
import { agentsWriteScopes, skillCollectionsWriteScopes } from "@app/scopes";
import { isSameSet } from "@app/utils/agentic";
import {
  duplicateNameCheck,
  getAxiosErrorMessage,
  getValidatedFromErrors,
  isValidGitUrl,
} from "@app/utils/utils";

import {
  getCollectionsContainingSkill,
  getSkillAttachmentParts,
} from "../skill-usage";

const FORM_ID = "skill-form";
const TITLE_ID = "skill-modal-title";
const SUBMIT_ID = "skill-form-submit";
const COLLECTIONS_TOGGLE_ID = "skill-skill-collections";
const COLLECTIONS_HELPER_ID = `${COLLECTIONS_TOGGLE_ID}-input-helper`;

/** Why the skill cannot leave a collection from this form. */
const COLLECTION_LOCKS = ["managedByKonveyor", "onlySkill"] as const;
type CollectionLock = (typeof COLLECTION_LOCKS)[number];

type AssociationField =
  | "agents"
  | "archetypes"
  | "targetProfiles"
  | "applications";

/** One picker per scope, in resolution order. */
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

/** The default first: absent means "skill" (the CRD default). */
const LOAD_POLICIES: SkillLoadPolicy[] = ["skill", "rule"];

interface FormValues {
  name: string;
  description: string;
  loadPolicy: SkillLoadPolicy;
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
  skillCollections: string[];
}

export interface SkillModalProps {
  isOpen: boolean;
  /** The skill to edit; create when null. */
  skill: Skill | null;
  onClose: () => void;
}

/** Create or edit a skill. */
export const SkillModal: React.FC<SkillModalProps> = ({
  isOpen,
  skill,
  onClose,
}) => {
  // Escape and the close button wait for the save: the skill and its
  // memberships are two writes, and the second must not run out of sight.
  const [isSaving, setIsSaving] = React.useState(false);
  return (
    <Modal
      id="skill-modal"
      variant="medium"
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      aria-labelledby={TITLE_ID}
    >
      {/* mounted only while open, so every opening starts from the skill */}
      {isOpen && (
        <SkillForm
          skill={skill}
          onClose={onClose}
          onSavingChange={setIsSaving}
        />
      )}
    </Modal>
  );
};

export interface SkillFormProps {
  skill: Skill | null;
  onClose: () => void;
  /** Told when a save starts and ends, so the modal can stay open. */
  onSavingChange?: (isSaving: boolean) => void;
}

/** The modal's header, body and footer. */
export const SkillForm: React.FC<SkillFormProps> = ({
  skill,
  onClose,
  onSavingChange,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);

  const { skills } = useFetchSkills();
  const { agents } = useFetchAgents();
  const { archetypes } = useFetchArchetypes();
  const { data: applications } = useFetchApplications(false);
  const {
    skillCollections,
    isLoading: isLoadingCollections,
    isFetching: isFetchingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  // Associating a skill with an agent writes the agent's skills, so the
  // Agents field needs agent write access. Without it the field is disabled
  // and its values are sent back unchanged.
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);
  // Membership is stored on each collection, so the Skill collections field
  // needs collection write access. Without it nothing is sent.
  const canManageCollections = useHasSomeScopes(skillCollectionsWriteScopes);
  // Known after a fresh read, not from the cache alone: the save replaces
  // the whole set, so a stale start could undo someone else's change.
  const isCollectionsKnown =
    !isLoadingCollections && !isFetchingCollections && collectionsError == null;
  const collectionsOfSkill = React.useMemo(
    () =>
      skill == null
        ? []
        : getCollectionsContainingSkill(skill, skillCollections).map(
            (collection) => collection.id
          ),
    [skill, skillCollections]
  );
  // Captured once, after the first fresh read, so a background refetch never
  // resets the user's selection; the save compares against it.
  const [initialCollections, setInitialCollections] = React.useState<
    string[] | undefined
  >(() => (isCollectionsKnown ? collectionsOfSkill : undefined));
  const isCollectionsDisabled =
    !canManageCollections || initialCollections == null;

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
      // From the archetypes, so a profile no plan uses is offered too.
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

  // The skill cannot leave a collection the operator reconciles, or one it is
  // the only member of (a collection needs at least one skill).
  const collectionLock = (id: string): CollectionLock | undefined => {
    const collection = skillCollections.find((c) => c.id === id);
    if (collection?.operatorManaged) {
      return "managedByKonveyor";
    }
    if (
      skill != null &&
      collection?.skills.length === 1 &&
      collection.skills[0].id === skill.id
    ) {
      return "onlySkill";
    }
    return undefined;
  };
  const lockReasons: Record<CollectionLock, string> = {
    managedByKonveyor: t("agentic.common.managedByKonveyor"),
    onlySkill: t("agentic.skill.onlySkillOfCollection"),
  };
  const collectionOptions: FilterSelectOptionProps[] = [...skillCollections]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((collection) => {
      const lock = collectionLock(collection.id);
      return {
        value: collection.id,
        label: collection.name,
        optionProps:
          lock == null
            ? undefined
            : { isAriaDisabled: true, description: lockReasons[lock] },
      };
    });
  const lockedCollections = (initialCollections ?? []).filter(
    (id) => collectionLock(id) != null
  );
  // A locked chip has no remove button to explain it, so the helper names
  // each locked collection with the reason that applies to it.
  const lockedHelpers = COLLECTION_LOCKS.map((lock) => {
    const names = lockedCollections
      .filter((id) => collectionLock(id) === lock)
      .map((id) => skillCollections.find((c) => c.id === id)?.name ?? id);
    return names.length > 0
      ? t(`agentic.skill.skillCollectionsLocked.${lock}`, {
          count: names.length,
          names,
        })
      : undefined;
  }).filter((helper) => helper != null);

  const notifyError = (title: string) => (error: AxiosError) =>
    pushNotification({
      title,
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  // The submit handler sequences the writes and shows the success toast once
  // every write is done; the hooks only report their own failure.
  const onWritten = () => undefined;

  const { mutateAsync: createSkill, isPending: isCreating } =
    useCreateSkillMutation(
      onWritten,
      notifyError(t("agentic.skill.createFailed"))
    );
  const { mutateAsync: updateSkill, isPending: isUpdating } =
    useUpdateSkillMutation(
      onWritten,
      notifyError(t("agentic.skill.updateFailed"))
    );
  const { mutateAsync: updateMemberships, isPending: isUpdatingMemberships } =
    useUpdateSkillCollectionMembershipsMutation(onWritten, (error) =>
      pushNotification({
        title: t("agentic.skill.collectionsSaveFailed"),
        message: t(
          skill
            ? "agentic.skill.collectionsSaveFailedUpdated"
            : "agentic.skill.collectionsSaveFailedCreated",
          { reason: getAxiosErrorMessage(error) }
        ),
        variant: "warning",
      })
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
    loadPolicy: mixed<SkillLoadPolicy>().oneOf(LOAD_POLICIES).required(),
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
    skillCollections: array().of(string().required()).defined(),
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isValidating, isValid, dirtyFields },
    control,
    setValue,
    getFieldState,
    resetField,
  } = useForm<FormValues>({
    defaultValues: {
      name: skill?.name || "",
      description: skill?.description || "",
      loadPolicy: skill?.loadPolicy ?? "skill",
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
      skillCollections: initialCollections ?? [],
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const selectedSourceType = useWatch({ control, name: "sourceType" });
  const selectedLoadPolicy = useWatch({ control, name: "loadPolicy" });
  const selectedCollections = useWatch({ control, name: "skillCollections" });
  // Save turns on for what the submit writes: a picker that is back to its
  // starting set in another order is no change.
  const hasChanges =
    Object.keys(dirtyFields).some((name) => name !== "skillCollections") ||
    (!isCollectionsDisabled &&
      initialCollections != null &&
      !isSameSet(selectedCollections, initialCollections));

  // The collections may load after the form opens: then they become the
  // field's starting value, unless the user already changed it.
  React.useEffect(() => {
    if (initialCollections != null || !isCollectionsKnown) {
      return;
    }
    setInitialCollections(collectionsOfSkill);
    if (!getFieldState("skillCollections").isDirty) {
      resetField("skillCollections", { defaultValue: collectionsOfSkill });
    }
  }, [
    collectionsOfSkill,
    getFieldState,
    initialCollections,
    isCollectionsKnown,
    resetField,
  ]);

  // The edit warning names what the delete reason names,
  // once both are known.
  const attachments =
    skill?.associations != null
      ? getSkillAttachmentParts(t, skill.associations)
      : undefined;
  const collectionCount =
    skill == null || isLoadingCollections || collectionsError != null
      ? undefined
      : getCollectionsContainingSkill(skill, skillCollections).length;
  const editWarning = (() => {
    if (attachments == null || collectionCount == null) {
      return undefined;
    }
    const collections = t("agentic.skill.collectionCount", {
      count: collectionCount,
    });
    if (attachments.length > 0 && collectionCount > 0) {
      return t("agentic.skill.editWarning.both", { attachments, collections });
    }
    if (attachments.length > 0) {
      return t("agentic.skill.editWarning.attachedOnly", { attachments });
    }
    if (collectionCount > 0) {
      return t("agentic.skill.editWarning.collectionsOnly", { collections });
    }
    return undefined;
  })();

  const onSubmit = async (formValues: FormValues) => {
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
      loadPolicy: formValues.loadPolicy,
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

    // The skill must exist before it can join a collection: write it first,
    // then the memberships if they changed.
    // When only the memberships changed, the skill is not rewritten: its
    // update time stays and its associations are not written again.
    const isSkillChanged = (
      Object.keys(formValues) as (keyof FormValues)[]
    ).some(
      (name) => name !== "skillCollections" && getFieldState(name).isDirty
    );
    let skillId: string;
    try {
      if (skill) {
        if (isSkillChanged) await updateSkill({ id: skill.id, ...payload });
        skillId = skill.id;
      } else {
        skillId = (await createSkill(payload)).id;
      }
    } catch {
      // The hook showed the failure; the modal stays open to retry.
      document.getElementById(SUBMIT_ID)?.focus();
      return;
    }

    if (
      !isCollectionsDisabled &&
      initialCollections != null &&
      !isSameSet(formValues.skillCollections, initialCollections)
    ) {
      try {
        await updateMemberships({
          skillId,
          collections: formValues.skillCollections.map((id) => ({ id })),
        });
      } catch {
        // The skill is saved and the hook showed a warning. Close anyway: a
        // retry from a create form would create a second skill.
        onClose();
        return;
      }
    }

    pushNotification({
      title: skill ? t("agentic.skill.updated") : t("agentic.skill.created"),
      variant: "success",
    });
    onClose();
  };

  const isSaving = isCreating || isUpdating || isUpdatingMemberships;
  // isSubmitting covers the whole handler, both writes included.
  React.useEffect(() => {
    onSavingChange?.(isSubmitting);
  }, [isSubmitting, onSavingChange]);
  React.useEffect(() => () => onSavingChange?.(false), [onSavingChange]);

  const associationField = ({
    field,
    toggleId,
  }: (typeof ASSOCIATION_FIELDS)[number]) => {
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
            ariaLabel={t(`agentic.skill.associationFields.${field}.label`)}
            inputAriaLabel={t(`agentic.skill.associationFields.${field}.label`)}
            inputAriaDescribedBy={`${toggleId}-input-helper`}
            maxMenuHeight={PICKER_MENU_HEIGHT}
            popperProps={PICKER_MENU_POPPER}
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
  };

  // Membership, not an attachment scope, so not one of ASSOCIATION_FIELDS.
  const collectionsField = (
    <HookFormPFGroupController
      control={control}
      name="skillCollections"
      label={t("agentic.skill.associationFields.skillCollections.label")}
      fieldId={`${COLLECTIONS_TOGGLE_ID}-input`}
      renderInput={({ field: { value } }) => (
        <>
          <MultiSelect
            toggleId={COLLECTIONS_TOGGLE_ID}
            toggleAriaLabel={t(
              "agentic.skill.associationFields.skillCollections.placeholder"
            )}
            ariaLabel={t(
              "agentic.skill.associationFields.skillCollections.label"
            )}
            inputAriaLabel={t(
              "agentic.skill.associationFields.skillCollections.label"
            )}
            inputAriaDescribedBy={COLLECTIONS_HELPER_ID}
            maxMenuHeight={PICKER_MENU_HEIGHT}
            popperProps={PICKER_MENU_POPPER}
            options={collectionOptions}
            values={value}
            lockedValues={lockedCollections}
            isDisabled={isCollectionsDisabled}
            hasCheckbox
            hasBadge
            hasChips
            onSelect={(selection) => {
              if (
                !selection ||
                isCollectionsDisabled ||
                lockedCollections.includes(selection)
              ) {
                return;
              }
              setValue(
                "skillCollections",
                value.includes(selection)
                  ? value.filter((id) => id !== selection)
                  : [...value, selection],
                { shouldDirty: true, shouldValidate: true }
              );
            }}
            onClear={() => {
              if (isCollectionsDisabled) return;
              setValue(
                "skillCollections",
                value.filter((id) => lockedCollections.includes(id)),
                { shouldDirty: true, shouldValidate: true }
              );
            }}
            placeholderText={t(
              "agentic.skill.associationFields.skillCollections.placeholder"
            )}
          />
          {/* Own helper: it has a warning variant and a second line. */}
          <FormHelperText id={COLLECTIONS_HELPER_ID}>
            <HelperText>
              {/* Only a failed first read leaves the field
                          disabled and unsent; after that, a failed refetch
                          changes nothing the save does. */}
              {initialCollections == null && collectionsError != null ? (
                <HelperTextItem variant="warning">
                  {t("agentic.skill.skillCollectionsUnavailable")}
                </HelperTextItem>
              ) : initialCollections == null ? (
                // Never an empty field that reads as "in no
                // collection" while they load.
                <HelperTextItem>
                  {t("agentic.skill.skillCollectionsLoading")}
                </HelperTextItem>
              ) : (
                <HelperTextItem>
                  {canManageCollections
                    ? t(
                        "agentic.skill.associationFields.skillCollections.helper"
                      )
                    : t("agentic.skill.skillCollectionsReadOnly")}
                </HelperTextItem>
              )}
              {canManageCollections &&
                lockedHelpers.map((helper) => (
                  <HelperTextItem key={helper}>{helper}</HelperTextItem>
                ))}
            </HelperText>
          </FormHelperText>
        </>
      )}
    />
  );

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
            <FormGroup
              role="radiogroup"
              isStack
              fieldId="skill-load-policy"
              label={t("agentic.skill.loadPolicy.label")}
            >
              {LOAD_POLICIES.map((policy) => (
                <Radio
                  key={policy}
                  id={`skill-load-policy-${policy}`}
                  name="skill-load-policy"
                  label={t(`agentic.skill.loadPolicy.${policy}`)}
                  description={t(
                    `agentic.skill.loadPolicy.${policy}Description`
                  )}
                  isChecked={selectedLoadPolicy === policy}
                  onChange={() =>
                    setValue("loadPolicy", policy, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              ))}
            </FormGroup>
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

          {/* Always visible on create and edit. */}
          <FormSection title={t("agentic.skill.usage")}>
            {/* Agents, then skill collections: both decide what a stage's
                agent gets; then the context owners. */}
            {ASSOCIATION_FIELDS.slice(0, 1).map(associationField)}
            {collectionsField}
            {ASSOCIATION_FIELDS.slice(1).map(associationField)}
          </FormSection>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          id={SUBMIT_ID}
          type="submit"
          form={FORM_ID}
          variant={ButtonVariant.primary}
          isDisabled={!isValid || !hasChanges}
          // Still focusable while saving, so focus stays in the dialog.
          isAriaDisabled={isSubmitting || isValidating || isSaving}
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
