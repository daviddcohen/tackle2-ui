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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { SkillCollection, SkillCollectionRequest } from "@app/agentic";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  useCreateSkillCollectionMutation,
  useFetchAgents,
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateSkillCollectionMutation,
} from "@app/queries/agentic";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

import { getAgentsUsingCollection } from "../skill-usage";

const FORM_ID = "skill-collection-form";
const TITLE_ID = "skill-collection-modal-title";

interface FormValues {
  name: string;
  description: string;
  skills: string[];
}

export interface SkillCollectionFormProps {
  collection: SkillCollection | null;
  onClose: () => void;
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
}) => (
  <Modal
    id="skill-collection-modal"
    variant="medium"
    isOpen={isOpen}
    onClose={onClose}
    aria-labelledby={TITLE_ID}
  >
    {/* mounted only while open, so every opening starts from the collection */}
    {isOpen && (
      <SkillCollectionForm collection={collection} onClose={onClose} />
    )}
  </Modal>
);

/** The modal's header, body and footer. */
export const SkillCollectionForm: React.FC<SkillCollectionFormProps> = ({
  collection,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { skills } = useFetchSkills();
  const { skillCollections } = useFetchSkillCollections();
  const {
    agents,
    isLoading: isLoadingAgents,
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
  });

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isDirty, isValid, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: collection?.name ?? "",
      description: collection?.description ?? "",
      skills: collection?.skills.map((s) => s.id) ?? [],
    },
    mode: "all",
    resolver: yupResolver(schema),
  });

  const selectedSkills = useWatch({ control, name: "skills" });

  const notifyError = (error: AxiosError) =>
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });

  const onSuccess = () => {
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

  const { mutate: createCollection, isPending: isCreating } =
    useCreateSkillCollectionMutation(onSuccess, notifyError);
  const { mutate: updateCollection, isPending: isUpdating } =
    useUpdateSkillCollectionMutation(onSuccess, notifyError);

  const onSubmit = (values: FormValues) => {
    const payload: SkillCollectionRequest = {
      name: values.name.trim(),
      description: values.description.trim(),
      skills: values.skills.map((id) => ({ id })),
    };
    if (collection) {
      updateCollection({ id: collection.id, ...payload });
    } else {
      createCollection(payload);
    }
  };

  const isSaving = isSubmitting || isCreating || isUpdating;

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
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={FORM_ID}
          variant={ButtonVariant.primary}
          isDisabled={!isDirty || !isValid || isSaving}
          isLoading={isSaving || undefined}
        >
          {collection ? t("actions.save") : t("actions.create")}
        </Button>
        <Button type="button" variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
