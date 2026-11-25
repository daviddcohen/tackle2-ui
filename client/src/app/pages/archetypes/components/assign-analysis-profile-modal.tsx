import * as React from "react";
import { LocationDescriptor } from "history";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertActionLink,
  Form,
  Modal,
  ModalBody,
  ModalHeader,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import type { Archetype, Ref, TargetProfile } from "@app/api/models";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { toRef } from "@app/utils/model-utils";

import { useAnalysisProfileOptions } from "../hooks/useAnalysisProfileOptions";
import { useTargetProfileMutation } from "../hooks/useArchetypeMutations";

import {
  ANALYSIS_PROFILE_FIELD_ID,
  TargetProfileAnalysisProfileField,
  TargetProfileFormValues,
} from "./target-profile-fields";
import {
  TargetProfileModalFooter,
  TargetProfileModalLoading,
  TargetProfileModalNotice,
  useFocusOnMount,
} from "./target-profile-modal-parts";

const FORM_ID = "assign-analysis-profile-form";
const TITLE_ID = "assign-analysis-profile-modal-title";
const DESCRIPTION_ID = "assign-analysis-profile-modal-description";
const FIRST_FIELD = `#${ANALYSIS_PROFILE_FIELD_ID}`;

export interface AssignAnalysisProfileModalProps {
  archetype: Archetype;
  profile: TargetProfile;
  linkTo: (pathname: string) => LocationDescriptor;
  onClose: () => void;
}

/**
 * Assign (or change, or clear) the analysis profile of a target profile.
 * Saves only its analysis profile.
 */
export const AssignAnalysisProfileModal: React.FC<
  AssignAnalysisProfileModalProps
> = ({ archetype, profile, linkTo, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  // Analysis profiles is a migration page, open to everyone who sees this one.
  const AnalysisProfilesLink = useLinkComponent(
    linkTo(DevPaths.analysisProfiles)
  );
  const {
    analysisProfiles,
    analysisProfileOptions,
    findProfileById,
    isFetching: isLoading,
    fetchError,
  } = useAnalysisProfileOptions();
  // The current analysis profile stays selectable when the list lacks it
  // (deleted meanwhile, for example), so opening and saving keeps it.
  const current = profile.analysisProfile;
  const missing =
    current != null && findProfileById(current.id) == null
      ? current
      : undefined;
  const options =
    missing != null
      ? [
          ...analysisProfileOptions,
          { value: String(missing.id), label: missing.name },
        ]
      : analysisProfileOptions;
  const findById = (id: number | undefined) =>
    findProfileById(id) ?? (id === missing?.id ? missing : undefined);
  const { updateTargetProfile, isPending } = useTargetProfileMutation();
  const save = (analysisProfile: Ref | null) =>
    updateTargetProfile(
      archetype,
      profile,
      { analysisProfile: toRef(analysisProfile ?? undefined) },
      {
        onSuccess: () => {
          pushNotification({
            title:
              analysisProfile != null
                ? t("agentic.archetype.analysisProfileAssigned")
                : t("agentic.archetype.analysisProfileRemoved"),
            variant: "success",
          });
          onClose();
        },
        onGone: onClose,
      }
    );

  // A failed background refetch keeps the list, and the form with it. Once
  // the list has loaded, the current analysis profile shows in the form even
  // when the list is empty, so it can be seen and removed.
  const hasForm =
    analysisProfiles.length > 0 ||
    (!isLoading && fetchError == null && options.length > 0);

  let content: React.ReactNode;
  if (hasForm) {
    content = (
      <AssignAnalysisProfileForm
        profile={profile}
        options={options}
        findProfileById={findById}
        isSaving={isPending}
        onSave={save}
        onCancel={onClose}
      />
    );
  } else if (isLoading) {
    content = <TargetProfileModalLoading onCancel={onClose} />;
  } else if (fetchError != null) {
    content = (
      <TargetProfileModalNotice
        onClose={onClose}
        alert={
          <Alert
            variant="danger"
            isInline
            isPlain
            title={t("agentic.archetype.analysisProfilesLoadFailed")}
          />
        }
      />
    );
  } else {
    content = (
      <TargetProfileModalNotice
        onClose={onClose}
        alert={
          <Alert
            variant="info"
            isInline
            title={t("agentic.archetype.noAnalysisProfilesTitle")}
            actionLinks={
              <AlertActionLink component={AnalysisProfilesLink}>
                {t("agentic.archetype.goToAnalysisProfiles")}
              </AlertActionLink>
            }
          >
            {t("agentic.archetype.noAnalysisProfilesBody", {
              profile: profile.name,
            })}
          </Alert>
        }
      />
    );
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      id="assign-analysis-profile-modal"
      // Other states keep the default: their first tabbable element.
      elementToFocus={hasForm ? FIRST_FIELD : undefined}
    >
      <ModalHeader
        labelId={TITLE_ID}
        descriptorId={DESCRIPTION_ID}
        title={
          profile.analysisProfile != null
            ? t("agentic.archetype.changeAnalysisProfile")
            : t("agentic.archetype.assignAnalysisProfile")
        }
        description={t("agentic.archetype.assignAnalysisProfileDescription", {
          archetype: archetype.name,
          profile: profile.name,
        })}
      />
      {content}
    </Modal>
  );
};

const AssignAnalysisProfileForm: React.FC<{
  profile: TargetProfile;
  options: FilterSelectOptionProps[];
  findProfileById: (id: number | undefined) => Ref | undefined;
  isSaving: boolean;
  onSave: (analysisProfile: Ref | null) => void;
  onCancel: () => void;
}> = ({ profile, options, findProfileById, isSaving, onSave, onCancel }) => {
  const initialId = profile.analysisProfile?.id;
  const { control, handleSubmit } = useForm<TargetProfileFormValues>({
    defaultValues: {
      analysisProfile: findProfileById(initialId) ?? null,
    },
  });
  const selected = useWatch({ control, name: "analysisProfile" });
  const isChanged = selected?.id !== initialId;
  useFocusOnMount(FIRST_FIELD);

  return (
    <>
      <ModalBody>
        <Form
          id={FORM_ID}
          onSubmit={handleSubmit((values) => {
            if (isChanged && !isSaving) onSave(values.analysisProfile);
          })}
        >
          <TargetProfileAnalysisProfileField
            control={control}
            options={options}
            findProfileById={findProfileById}
          />
        </Form>
      </ModalBody>
      <TargetProfileModalFooter
        formId={FORM_ID}
        canSubmit={isChanged}
        isSaving={isSaving}
        onCancel={onCancel}
      />
    </>
  );
};
