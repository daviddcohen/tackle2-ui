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

import { AdminPaths } from "@app/Paths";
import type { Archetype, Ref, TargetProfile } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { adminViewScopes } from "@app/auth/roles-to-scopes";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { useFetchGenerators } from "@app/queries/generators";
import { isSameSet } from "@app/utils/agentic";
import { refsToItems, toRefs } from "@app/utils/model-utils";

import { useTargetProfileMutation } from "../hooks/useArchetypeMutations";

import {
  GENERATORS_FIELD_ID,
  TargetProfileFormValues,
  TargetProfileGeneratorsField,
} from "./target-profile-fields";
import {
  TargetProfileModalFooter,
  TargetProfileModalLoading,
  TargetProfileModalNotice,
  useFocusOnMount,
} from "./target-profile-modal-parts";

const FORM_ID = "manage-generators-form";
const TITLE_ID = "manage-generators-modal-title";
const DESCRIPTION_ID = "manage-generators-modal-description";
const FIRST_FIELD = `#${GENERATORS_FIELD_ID} input`;

export interface ManageGeneratorsModalProps {
  archetype: Archetype;
  profile: TargetProfile;
  linkTo: (pathname: string) => LocationDescriptor;
  onClose: () => void;
}

/** Choose the generators of a target profile. Saves only its generators. */
export const ManageGeneratorsModal: React.FC<ManageGeneratorsModalProps> = ({
  archetype,
  profile,
  linkTo,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  // The Generators page is an administration page.
  const canOpenGenerators = useHasSomeScopes(adminViewScopes);
  const GeneratorsLink = useLinkComponent(
    canOpenGenerators ? linkTo(AdminPaths.assetGenerators) : undefined
  );
  const { generators, isLoading, fetchError } = useFetchGenerators();
  // Generators the profile references but the list lacks (deleted meanwhile,
  // for example) stay chosen and are kept on save unless moved out.
  const options = React.useMemo<Ref[]>(
    () => [
      ...generators,
      ...profile.generators.filter(
        (ref) => !generators.some(({ id }) => id === ref.id)
      ),
    ],
    [generators, profile.generators]
  );
  const { updateTargetProfile, isPending } = useTargetProfileMutation();
  const save = (chosen: Ref[]) =>
    updateTargetProfile(
      archetype,
      profile,
      { generators: toRefs(chosen) },
      {
        onSuccess: () => {
          pushNotification({
            title: t("agentic.archetype.generatorsSaved", {
              profile: profile.name,
            }),
            variant: "success",
          });
          onClose();
        },
        onGone: onClose,
      }
    );

  // A failed background refetch keeps the list, and the form with it. Once
  // the list has loaded, the profile's own generators show in the form even
  // when the list is empty, so they can be seen and moved out.
  const hasForm =
    generators.length > 0 ||
    (!isLoading && fetchError == null && options.length > 0);

  let content: React.ReactNode;
  if (hasForm) {
    content = (
      <ManageGeneratorsForm
        profile={profile}
        generators={options}
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
            title={t("agentic.archetype.generatorsLoadFailed")}
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
            title={t("agentic.archetype.noGeneratorsTitle")}
            actionLinks={
              GeneratorsLink && (
                <AlertActionLink component={GeneratorsLink}>
                  {t("agentic.archetype.goToGenerators")}
                </AlertActionLink>
              )
            }
          >
            {canOpenGenerators
              ? t("agentic.archetype.noGeneratorsBody", {
                  profile: profile.name,
                })
              : t("agentic.archetype.noGeneratorsBodyReadOnly", {
                  profile: profile.name,
                })}
          </Alert>
        }
      />
    );
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      id="manage-generators-modal"
      // Other states keep the default: their first tabbable element.
      elementToFocus={hasForm ? FIRST_FIELD : undefined}
    >
      <ModalHeader
        labelId={TITLE_ID}
        descriptorId={DESCRIPTION_ID}
        title={t("agentic.archetype.manageGeneratorsTitle", {
          profile: profile.name,
        })}
        description={t("agentic.archetype.manageGeneratorsDescription", {
          archetype: archetype.name,
          profile: profile.name,
        })}
      />
      {content}
    </Modal>
  );
};

const ManageGeneratorsForm: React.FC<{
  profile: TargetProfile;
  generators: Ref[];
  isSaving: boolean;
  onSave: (chosen: Ref[]) => void;
  onCancel: () => void;
}> = ({ profile, generators, isSaving, onSave, onCancel }) => {
  // Read once: a background refetch keeps the selection.
  const [initial] = React.useState(() =>
    refsToItems(generators, profile.generators)
  );
  const { control, handleSubmit } = useForm<TargetProfileFormValues>({
    defaultValues: { generators: initial },
  });
  const chosen = useWatch({ control, name: "generators" });
  const isChanged = !isSameSet(
    chosen.map(({ id }) => String(id)),
    initial.map(({ id }) => String(id))
  );
  useFocusOnMount(FIRST_FIELD);

  return (
    <>
      <ModalBody>
        <Form
          id={FORM_ID}
          onSubmit={handleSubmit((values) => {
            if (isChanged && !isSaving) onSave(values.generators);
          })}
        >
          <TargetProfileGeneratorsField
            control={control}
            generators={generators}
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
