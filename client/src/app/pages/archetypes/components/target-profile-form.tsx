import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Form,
  Modal,
  ModalBody,
  ModalHeader,
} from "@patternfly/react-core";

import { isAgenticEnabled } from "@app/Constants";
import type { Archetype, Generator, TargetProfile } from "@app/api/models";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useFetchGenerators } from "@app/queries/generators";
import { toRef, toRefs } from "@app/utils/model-utils";

import { useAnalysisProfileOptions } from "../hooks/useAnalysisProfileOptions";
import { useTargetProfileMutation } from "../hooks/useArchetypeMutations";

import {
  NAME_FIELD_ID,
  TargetProfileAnalysisProfileField,
  TargetProfileFormValues,
  TargetProfileGeneratorsField,
  TargetProfileNameField,
  useTargetProfileSchema,
} from "./target-profile-fields";
import {
  TargetProfileModalFooter,
  TargetProfileModalLoading,
  useFocusOnMount,
} from "./target-profile-modal-parts";

const FORM_ID = "target-profile-form";
const TITLE_ID = "target-profile-modal-title";
const DESCRIPTION_ID = "target-profile-modal-description";
const FIRST_FIELD = `#${NAME_FIELD_ID}`;

interface TargetProfileModalProps {
  archetype: Archetype;
  onClose: () => void;
}

/**
 * Create a target profile with its own fields: name, generators and
 * analysis profile. Each can be changed later from the row's actions.
 */
export const CreateTargetProfileModal: React.FC<TargetProfileModalProps> = ({
  archetype,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const {
    generators,
    isLoading: isGeneratorsLoading,
    fetchError: generatorsError,
  } = useFetchGenerators();
  const {
    analysisProfileOptions,
    findProfileById,
    isFetching: isAnalysisProfilesLoading,
    fetchError: analysisProfilesError,
  } = useAnalysisProfileOptions();
  const { createTargetProfile, isPending } = useTargetProfileMutation();
  const submitLabel = t("actions.create");

  const isLoading = isGeneratorsLoading || isAnalysisProfilesLoading;
  return (
    <Modal
      variant="medium"
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      id="target-profile-modal"
      elementToFocus={isLoading ? undefined : FIRST_FIELD}
    >
      <ModalHeader
        labelId={TITLE_ID}
        descriptorId={DESCRIPTION_ID}
        title={t("dialog.title.newTargetProfile")}
        description={
          isAgenticEnabled
            ? t("agentic.archetype.targetProfileFormDescription")
            : t("agentic.archetype.targetProfilesDescriptionWithoutPlans")
        }
      />
      {isLoading ? (
        <TargetProfileModalLoading
          submitLabel={submitLabel}
          onCancel={onClose}
        />
      ) : (
        <CreateTargetProfileForm
          archetype={archetype}
          generators={generators}
          isGeneratorsError={generators.length === 0 && generatorsError != null}
          analysisProfileOptions={analysisProfileOptions}
          isAnalysisProfilesError={
            analysisProfileOptions.length === 0 && analysisProfilesError != null
          }
          findProfileById={findProfileById}
          isSaving={isPending}
          submitLabel={submitLabel}
          onSave={(values) =>
            createTargetProfile(
              archetype,
              {
                name: values.name,
                generators: toRefs(values.generators),
                analysisProfile: toRef(values.analysisProfile ?? undefined),
              },
              () => {
                pushNotification({
                  title: t("toastr.success.targetProfileCreated"),
                  variant: "success",
                });
                onClose();
              }
            )
          }
          onCancel={onClose}
        />
      )}
    </Modal>
  );
};

const CreateTargetProfileForm: React.FC<{
  archetype: Archetype;
  generators: Generator[];
  isGeneratorsError: boolean;
  analysisProfileOptions: FilterSelectOptionProps[];
  isAnalysisProfilesError: boolean;
  findProfileById: React.ComponentProps<
    typeof TargetProfileAnalysisProfileField
  >["findProfileById"];
  isSaving: boolean;
  submitLabel: string;
  onSave: (values: TargetProfileFormValues) => void;
  onCancel: () => void;
}> = ({
  archetype,
  generators,
  isGeneratorsError,
  analysisProfileOptions,
  isAnalysisProfilesError,
  findProfileById,
  isSaving,
  submitLabel,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const {
    handleSubmit,
    control,
    formState: { isValid },
  } = useForm<TargetProfileFormValues>({
    defaultValues: { name: "", generators: [], analysisProfile: null },
    resolver: yupResolver(useTargetProfileSchema(archetype, null)),
    mode: "all",
  });
  useFocusOnMount(FIRST_FIELD);

  return (
    <>
      <ModalBody>
        <Form
          id={FORM_ID}
          onSubmit={handleSubmit((values) => {
            if (!isSaving) onSave(values);
          })}
        >
          <TargetProfileNameField control={control} />
          {isGeneratorsError ? (
            <Alert
              variant="danger"
              isInline
              isPlain
              title={t("agentic.archetype.generatorsLoadFailed")}
            />
          ) : (
            <TargetProfileGeneratorsField
              control={control}
              generators={generators}
            />
          )}
          {isAnalysisProfilesError ? (
            <Alert
              variant="danger"
              isInline
              isPlain
              title={t("agentic.archetype.analysisProfilesLoadFailed")}
            />
          ) : (
            <TargetProfileAnalysisProfileField
              control={control}
              options={analysisProfileOptions}
              findProfileById={findProfileById}
            />
          )}
        </Form>
      </ModalBody>
      <TargetProfileModalFooter
        formId={FORM_ID}
        submitLabel={submitLabel}
        canSubmit={isValid}
        isSaving={isSaving}
        onCancel={onCancel}
      />
    </>
  );
};

/**
 * Edit the basic details of a target profile: its name. Generators,
 * analysis profile, migration plan and skills have their own row actions.
 */
export const EditTargetProfileModal: React.FC<
  TargetProfileModalProps & { profile: TargetProfile }
> = ({ archetype, profile, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { updateTargetProfile, isPending } = useTargetProfileMutation();
  const {
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<TargetProfileFormValues>({
    defaultValues: { name: profile.name },
    resolver: yupResolver(useTargetProfileSchema(archetype, profile)),
    mode: "all",
  });
  const canSubmit = isValid && isDirty;

  return (
    <Modal
      variant="small"
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      id="target-profile-modal"
      elementToFocus={FIRST_FIELD}
    >
      <ModalHeader
        labelId={TITLE_ID}
        descriptorId={DESCRIPTION_ID}
        title={t("dialog.title.updateTargetProfile")}
        description={t(
          "agentic.archetype.targetProfilesDescriptionWithoutPlans"
        )}
      />
      <ModalBody>
        <Form
          id={FORM_ID}
          onSubmit={handleSubmit(({ name }) => {
            if (!canSubmit || isPending) return;
            updateTargetProfile(
              archetype,
              profile,
              { name },
              {
                onSuccess: () => {
                  pushNotification({
                    title: t("toastr.success.targetProfileUpdated"),
                    variant: "success",
                  });
                  onClose();
                },
                onGone: onClose,
              }
            );
          })}
        >
          <TargetProfileNameField control={control} />
        </Form>
      </ModalBody>
      <TargetProfileModalFooter
        formId={FORM_ID}
        canSubmit={canSubmit}
        isSaving={isPending}
        onCancel={onClose}
      />
    </Modal>
  );
};
