import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { array, object, string } from "yup";
import {
  ActionGroup,
  Button,
  ButtonVariant,
  Form,
} from "@patternfly/react-core";

import {
  EntityId,
  SkillCollection,
  SkillCollectionRequest,
} from "@app/agentic";
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
  useFetchSkillCollections,
  useFetchSkills,
  useUpdateSkillCollectionMutation,
} from "@app/queries/agentic";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

interface FormValues {
  name: string;
  description: string;
  skills: string[];
}

export interface SkillCollectionFormProps {
  collection: SkillCollection | null;
  /** Pre-selected skill ids for the "create from selection" flow. */
  initialSkillIds?: EntityId[];
  onClose: () => void;
}

export const SkillCollectionForm: React.FC<SkillCollectionFormProps> = ({
  collection,
  initialSkillIds,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { skills } = useFetchSkills();
  const { skillCollections } = useFetchSkillCollections();

  const options: FilterSelectOptionProps[] = skills.map((skill) => ({
    value: skill.id,
    label: skill.name,
  }));

  const schema = object({
    name: string()
      .trim()
      .required(t("agentic.skillCollection.nameRequired"))
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
      .min(1, t("agentic.skillCollection.skillsRequired"))
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
      skills: collection?.skills.map((s) => s.id) ?? initialSkillIds ?? [],
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

  return (
    <Form id="skill-collection-form" onSubmit={handleSubmit(onSubmit)}>
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
      />
      <HookFormPFGroupController
        control={control}
        name="skills"
        label={t("agentic.skillCollection.members")}
        fieldId="skill-collection-skills"
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
            placeholderText={t("agentic.skillCollection.addSkills")}
          />
        )}
      />
      <ActionGroup>
        <Button
          type="submit"
          variant={ButtonVariant.primary}
          isDisabled={
            !isDirty || !isValid || isSubmitting || isCreating || isUpdating
          }
          isLoading={isSubmitting || isCreating || isUpdating}
        >
          {collection ? t("actions.save") : t("actions.create")}
        </Button>
        <Button type="button" variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ActionGroup>
    </Form>
  );
};
