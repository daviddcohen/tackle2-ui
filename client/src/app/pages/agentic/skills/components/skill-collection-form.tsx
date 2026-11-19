import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, object, string } from "yup";
import {
  Alert,
  Button,
  ButtonVariant,
  Form,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { SkillCollection, SkillCollectionRequest } from "@app/agentic";
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
  useCreateSkillCollectionMutation,
  useFetchAgents,
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateSkillCollectionAgentsMutation,
  useUpdateSkillCollectionMutation,
} from "@app/queries/agentic";
import { agentsWriteScopes } from "@app/scopes";
import { isSameSet } from "@app/utils/agentic";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

import { getAgentsUsingCollection } from "../skill-usage";

const FORM_ID = "skill-collection-form";
const TITLE_ID = "skill-collection-modal-title";
const SUBMIT_ID = "skill-collection-form-submit";
const AGENTS_TOGGLE_ID = "skill-collection-agents";
const AGENTS_HELPER_ID = `${AGENTS_TOGGLE_ID}-input-helper`;

interface FormValues {
  name: string;
  description: string;
  skills: string[];
  agents: string[];
}

export interface SkillCollectionFormProps {
  collection: SkillCollection | null;
  onClose: () => void;
  /** Told when a save starts and ends, so the modal can stay open. */
  onSavingChange?: (isSaving: boolean) => void;
}

export interface SkillCollectionModalProps {
  isOpen: boolean;
  /** The collection to edit; create when null. */
  collection: SkillCollection | null;
  onClose: () => void;
}

/** Create or edit a skill collection. */
export const SkillCollectionModal: React.FC<SkillCollectionModalProps> = ({
  isOpen,
  collection,
  onClose,
}) => {
  // Escape and the close button wait for the save: the collection and its
  // agents are two writes, and the second must not run out of sight.
  const [isSaving, setIsSaving] = React.useState(false);
  return (
    <Modal
      id="skill-collection-modal"
      variant="medium"
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      aria-labelledby={TITLE_ID}
    >
      {/* mounted only while open, so every opening starts from the collection */}
      {isOpen && (
        <SkillCollectionForm
          collection={collection}
          onClose={onClose}
          onSavingChange={setIsSaving}
        />
      )}
    </Modal>
  );
};

/** The modal's header, body and footer. */
export const SkillCollectionForm: React.FC<SkillCollectionFormProps> = ({
  collection,
  onClose,
  onSavingChange,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { skills } = useFetchSkills();
  const { skillCollections } = useFetchSkillCollections();
  const {
    agents,
    isLoading: isLoadingAgents,
    isFetching: isFetchingAgents,
    fetchError: agentsError,
  } = useFetchAgents();
  // The edit warning counts the agents the same way as the delete reason.
  // Until the agents are known it never looks like "not used": a
  // skeleton while they load, a usage-unchecked warning if they fail.
  const agentsUsingCollection =
    collection == null || isLoadingAgents || agentsError != null
      ? 0
      : getAgentsUsingCollection(collection.id, agents).length;
  const isUsageUnchecked =
    collection != null && !isLoadingAgents && agentsError != null;

  // Using a collection is stored on each agent, so the Agents field needs
  // agent write access. Without it nothing is sent.
  const canManageAgents = useHasSomeScopes(agentsWriteScopes);
  // Known after a fresh read, not from the cache alone: the save replaces
  // the whole set, so a stale start could undo someone else's change.
  const isAgentsKnown =
    !isLoadingAgents && !isFetchingAgents && agentsError == null;
  const agentsOfCollection = React.useMemo(
    () =>
      collection == null
        ? []
        : getAgentsUsingCollection(collection.id, agents).map(
            (agent) => agent.id
          ),
    [agents, collection]
  );
  // Captured once, after the first fresh read, so a background refetch never
  // resets the user's selection; the save compares against it.
  const [initialAgents, setInitialAgents] = React.useState<
    string[] | undefined
  >(() => (isAgentsKnown ? agentsOfCollection : undefined));
  const isAgentsDisabled = !canManageAgents || initialAgents == null;
  // The operator reconciles managed agents, so they cannot be changed here.
  const lockedAgents = (initialAgents ?? []).filter(
    (id) => agents.find((agent) => agent.id === id)?.operatorManaged
  );
  const agentOptions: FilterSelectOptionProps[] = [...agents]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((agent) => ({
      value: agent.id,
      label: agent.name,
      optionProps: agent.operatorManaged
        ? {
            isAriaDisabled: true,
            description: t("agentic.common.managedByKonveyor"),
          }
        : undefined,
    }));

  const options: FilterSelectOptionProps[] = skills.map((skill) => ({
    value: skill.id,
    label: skill.name,
  }));

  const schema = object({
    name: string()
      .trim()
      .required(t("agentic.skillCollection.validation.nameRequired"))
      .max(120, t("agentic.skillCollection.validation.nameMaximum"))
      .test(
        "duplicate-name",
        t("agentic.skillCollection.validation.nameDuplicate"),
        (value) => duplicateNameCheck(skillCollections, collection, value ?? "")
      ),
    // Optional: the SkillCollection CRD has no description field.
    description: string()
      .trim()
      .max(500, t("agentic.skillCollection.validation.descriptionMaximum")),
    skills: array()
      .of(string().required())
      .min(1, t("agentic.skillCollection.validation.skillsRequired"))
      .defined(),
    agents: array().of(string().required()).defined(),
  });

  const {
    control,
    handleSubmit,
    setValue,
    getFieldState,
    resetField,
    formState: { dirtyFields, isValid, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: collection?.name ?? "",
      description: collection?.description ?? "",
      skills: collection?.skills.map((s) => s.id) ?? [],
      agents: initialAgents ?? [],
    },
    mode: "all",
    resolver: yupResolver(schema),
  });

  const selectedSkills = useWatch({ control, name: "skills" });
  const selectedAgents = useWatch({ control, name: "agents" });
  // Save turns on for what the submit writes: a picker that is back to its
  // starting set in another order is no change.
  const hasChanges =
    Object.keys(dirtyFields).some((name) => name !== "agents") ||
    (!isAgentsDisabled &&
      initialAgents != null &&
      !isSameSet(selectedAgents, initialAgents));

  // The agents may load after the form opens: then they become the field's
  // starting value, unless the user already changed it.
  React.useEffect(() => {
    if (initialAgents != null || !isAgentsKnown) {
      return;
    }
    setInitialAgents(agentsOfCollection);
    if (!getFieldState("agents").isDirty) {
      resetField("agents", { defaultValue: agentsOfCollection });
    }
  }, [
    agentsOfCollection,
    getFieldState,
    initialAgents,
    isAgentsKnown,
    resetField,
  ]);

  const notifyError = (error: AxiosError) =>
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  // The submit handler sequences the writes and shows the success toast once
  // every write is done; the hooks only report their own failure.
  const onWritten = () => undefined;

  const { mutateAsync: createCollection, isPending: isCreating } =
    useCreateSkillCollectionMutation(onWritten, notifyError);
  const { mutateAsync: updateCollection, isPending: isUpdating } =
    useUpdateSkillCollectionMutation(onWritten, notifyError);
  const { mutateAsync: updateAgents, isPending: isUpdatingAgents } =
    useUpdateSkillCollectionAgentsMutation(onWritten, (error) =>
      pushNotification({
        title: t("agentic.skillCollection.agentsSaveFailed"),
        message: t(
          collection
            ? "agentic.skillCollection.agentsSaveFailedUpdated"
            : "agentic.skillCollection.agentsSaveFailedCreated",
          { reason: getAxiosErrorMessage(error) }
        ),
        variant: "warning",
      })
    );

  const onSubmit = async (values: FormValues) => {
    const payload: SkillCollectionRequest = {
      name: values.name.trim(),
      description: values.description.trim(),
      skills: values.skills.map((id) => ({ id })),
    };
    // The collection must exist before agents can use it: write it first,
    // then the agents if they changed.
    // When only the agents changed, the collection is not rewritten.
    const isCollectionChanged = (
      ["name", "description", "skills"] as const
    ).some((name) => getFieldState(name).isDirty);
    let collectionId: string;
    try {
      if (collection) {
        if (isCollectionChanged) {
          await updateCollection({ id: collection.id, ...payload });
        }
        collectionId = collection.id;
      } else {
        collectionId = (await createCollection(payload)).id;
      }
    } catch {
      // The hook showed the failure; the modal stays open to retry.
      document.getElementById(SUBMIT_ID)?.focus();
      return;
    }

    if (
      !isAgentsDisabled &&
      initialAgents != null &&
      !isSameSet(values.agents, initialAgents)
    ) {
      try {
        await updateAgents({
          collectionId,
          agents: values.agents.map((id) => ({ id })),
        });
      } catch {
        // The collection is saved and the hook showed a warning. Close
        // anyway: a retry from a create form would create a second one.
        onClose();
        return;
      }
    }

    pushNotification({
      title: t(
        collection
          ? "agentic.skillCollection.updated"
          : "agentic.skillCollection.created"
      ),
      variant: "success",
    });
    onClose();
  };

  const isSaving = isSubmitting || isCreating || isUpdating || isUpdatingAgents;
  // isSubmitting covers the whole handler, both writes included.
  React.useEffect(() => {
    onSavingChange?.(isSubmitting);
  }, [isSubmitting, onSavingChange]);
  React.useEffect(() => () => onSavingChange?.(false), [onSavingChange]);

  return (
    <>
      <ModalHeader
        title={
          collection
            ? t("agentic.skillCollection.edit")
            : t("agentic.skillCollection.create")
        }
        description={t("agentic.skillCollection.formDescription")}
        labelId={TITLE_ID}
      />
      <ModalBody>
        {collection != null && isLoadingAgents ? (
          <Skeleton
            width="50%"
            className={spacing.mbLg}
            screenreaderText={t("terms.loading")}
          />
        ) : isUsageUnchecked || agentsUsingCollection > 0 ? (
          <Alert
            variant="warning"
            isInline
            isPlain
            title={
              isUsageUnchecked
                ? t("agentic.skillCollection.editUsageUnchecked")
                : t("agentic.skillCollection.editWarning", {
                    count: agentsUsingCollection,
                  })
            }
            className={spacing.mbLg}
          />
        ) : null}
        <Form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <HookFormPFTextInput
            control={control}
            name="name"
            label={t("terms.name")}
            fieldId="skill-collection-name"
            isRequired
          />
          <HookFormPFTextArea
            control={control}
            name="description"
            label={t("terms.description")}
            fieldId="skill-collection-description"
            rows={2}
            resizeOrientation="vertical"
          />
          <HookFormPFGroupController
            control={control}
            name="skills"
            label={t("agentic.skillCollection.members")}
            fieldId="skill-collection-skills"
            helperText={t("agentic.skillCollection.skillsHelper")}
            isRequired
            renderInput={() => (
              <MultiSelect
                toggleId="skill-collection-skills-select"
                toggleAriaLabel={t("agentic.skillCollection.selectSkills")}
                ariaLabel={t("agentic.skillCollection.members")}
                inputAriaLabel={t("agentic.skillCollection.members")}
                inputAriaDescribedBy="skill-collection-skills-helper"
                maxMenuHeight={PICKER_MENU_HEIGHT}
                popperProps={PICKER_MENU_POPPER}
                values={selectedSkills}
                options={options}
                hasCheckbox
                hasBadge
                hasChips
                onSelect={(selection) => {
                  if (!selection) return;
                  setValue(
                    "skills",
                    selectedSkills.includes(selection)
                      ? selectedSkills.filter((s) => s !== selection)
                      : [...selectedSkills, selection],
                    { shouldDirty: true, shouldValidate: true }
                  );
                }}
                onClear={() =>
                  setValue("skills", [], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                placeholderText={t("agentic.skillCollection.selectSkills")}
              />
            )}
          />
          {/* Named like the detail page section; last, after the members. */}
          <HookFormPFGroupController
            control={control}
            name="agents"
            label={t("agentic.skillCollection.agents")}
            fieldId={`${AGENTS_TOGGLE_ID}-input`}
            renderInput={({ field: { value } }) => (
              <>
                <MultiSelect
                  toggleId={AGENTS_TOGGLE_ID}
                  toggleAriaLabel={t("agentic.skillCollection.selectAgents")}
                  ariaLabel={t("agentic.skillCollection.agents")}
                  inputAriaLabel={t("agentic.skillCollection.agents")}
                  inputAriaDescribedBy={AGENTS_HELPER_ID}
                  maxMenuHeight={PICKER_MENU_HEIGHT}
                  popperProps={PICKER_MENU_POPPER}
                  values={value}
                  options={agentOptions}
                  lockedValues={lockedAgents}
                  isDisabled={isAgentsDisabled}
                  hasCheckbox
                  hasBadge
                  hasChips
                  onSelect={(selection) => {
                    if (
                      !selection ||
                      isAgentsDisabled ||
                      lockedAgents.includes(selection)
                    ) {
                      return;
                    }
                    setValue(
                      "agents",
                      value.includes(selection)
                        ? value.filter((id) => id !== selection)
                        : [...value, selection],
                      { shouldDirty: true, shouldValidate: true }
                    );
                  }}
                  onClear={() => {
                    if (isAgentsDisabled) return;
                    setValue(
                      "agents",
                      value.filter((id) => lockedAgents.includes(id)),
                      { shouldDirty: true, shouldValidate: true }
                    );
                  }}
                  placeholderText={t("agentic.skillCollection.selectAgents")}
                />
                {/* Own helper: it has a warning variant and a second line. */}
                <FormHelperText id={AGENTS_HELPER_ID}>
                  <HelperText>
                    {/* Only a failed first read leaves the field disabled
                        and unsent; after that, a failed refetch changes
                        nothing the save does. */}
                    {initialAgents == null && agentsError != null ? (
                      <HelperTextItem variant="warning">
                        {t("agentic.skillCollection.agentsUnavailable")}
                      </HelperTextItem>
                    ) : initialAgents == null ? (
                      // Never an empty field that reads as "used by no
                      // agent" while they load.
                      <HelperTextItem>
                        {t("agentic.skillCollection.agentsLoading")}
                      </HelperTextItem>
                    ) : (
                      <HelperTextItem>
                        {canManageAgents
                          ? t("agentic.skillCollection.agentsHelper")
                          : t("agentic.skill.agentsReadOnly")}
                      </HelperTextItem>
                    )}
                    {canManageAgents && lockedAgents.length > 0 && (
                      // A locked chip has no remove button to explain it.
                      <HelperTextItem>
                        {t("agentic.skillCollection.agentsLocked", {
                          count: lockedAgents.length,
                          names: lockedAgents.map(
                            (id) =>
                              agents.find((agent) => agent.id === id)?.name ??
                              id
                          ),
                        })}
                      </HelperTextItem>
                    )}
                  </HelperText>
                </FormHelperText>
              </>
            )}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          id={SUBMIT_ID}
          type="submit"
          form={FORM_ID}
          variant={ButtonVariant.primary}
          isDisabled={!hasChanges || !isValid}
          // Still focusable while saving, so focus stays in the dialog.
          isAriaDisabled={isSaving}
          isLoading={isSaving || undefined}
        >
          {collection ? t("actions.save") : t("actions.create")}
        </Button>
        <Button
          type="button"
          variant={ButtonVariant.link}
          isDisabled={isSaving}
          onClick={onClose}
        >
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
