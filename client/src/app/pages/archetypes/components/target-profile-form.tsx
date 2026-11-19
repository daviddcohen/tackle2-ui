import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import {
  Bullseye,
  Button,
  Form,
  FormGroupLabelHelp,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Popover,
  Spinner,
} from "@patternfly/react-core";

import { isAgenticEnabled } from "@app/Constants";
import type {
  AnalysisProfile,
  Archetype,
  Generator,
  TargetProfile,
} from "@app/api/models";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { useFetchGenerators } from "@app/queries/generators";
import { refsToItems, toRef, toRefs } from "@app/utils/model-utils";
import { duplicateNameCheck } from "@app/utils/utils";

import { DualListSelector } from "../../../components/dual-list-selector";
import { useAnalysisProfileOptions } from "../hooks/useAnalysisProfileOptions";

interface TargetProfileFormValues {
  name: string;
  generators: Generator[];
  analysisProfile: AnalysisProfile | null;
}

interface TargetProfileFormProps {
  isOpen: boolean;
  onCancel: () => void;
  onSave: (profile: TargetProfile) => void;
  archetype: Archetype;
  profile?: TargetProfile | null;
}

interface TargetProfileFormPropsInner extends TargetProfileFormProps {
  generators: Generator[];
  analysisProfileOptions: FilterSelectOptionProps[];
  findProfileById: (id: number | undefined) => AnalysisProfile | undefined;
}

const FORM_ID = "target-profile-form";
const TITLE_ID = "target-profile-modal-title";

/** The modal shell: header, body and footer are the same while loading. */
const TargetProfileModal: React.FC<{
  profile?: TargetProfile | null;
  onCancel: () => void;
  body: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ profile, onCancel, body, footer }) => {
  const { t } = useTranslation();
  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onCancel}
      aria-labelledby={TITLE_ID}
      id="target-profile-modal"
    >
      <ModalHeader
        labelId={TITLE_ID}
        title={
          profile
            ? t("dialog.title.updateTargetProfile")
            : t("dialog.title.newTargetProfile")
        }
        description={
          // The next step only makes sense before the profile exists.
          !profile && isAgenticEnabled
            ? t("agentic.archetype.targetProfileFormDescription")
            : t("agentic.archetype.targetProfilesDescriptionWithoutPlans")
        }
      />
      <ModalBody>{body}</ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </Modal>
  );
};

const TargetProfileForm: React.FC<TargetProfileFormProps> = (props) =>
  // Nothing is rendered or fetched while the form is closed.
  props.isOpen ? <TargetProfileFormLoader {...props} /> : null;

const TargetProfileFormLoader: React.FC<TargetProfileFormProps> = (props) => {
  const { t } = useTranslation();
  const { generators, isLoading: isGeneratorsLoading } = useFetchGenerators();
  const {
    analysisProfileOptions,
    findProfileById,
    isFetching: isAnalysisProfilesLoading,
  } = useAnalysisProfileOptions();

  if (isGeneratorsLoading || isAnalysisProfilesLoading) {
    return (
      <TargetProfileModal
        profile={props.profile}
        onCancel={props.onCancel}
        body={
          <Bullseye>
            <Spinner aria-label={t("terms.loading")} />
          </Bullseye>
        }
      />
    );
  }

  return (
    <TargetProfileFormInner
      {...props}
      generators={generators}
      analysisProfileOptions={analysisProfileOptions}
      findProfileById={findProfileById}
    />
  );
};

const TargetProfileFormInner: React.FC<TargetProfileFormPropsInner> = ({
  onCancel,
  onSave,
  archetype,
  profile = null,
  generators,
  analysisProfileOptions,
  findProfileById,
}) => {
  const { t } = useTranslation();

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .trim()
      .required(t("validation.required"))
      .min(3, t("validation.minLength", { length: 3 }))
      .max(120, t("validation.maxLength", { length: 120 }))
      .test(
        "unique-name",
        t("validation.duplicateTargetProfileName"),
        (value) =>
          duplicateNameCheck(archetype.profiles ?? [], profile, value ?? "")
      ),
    generators: yup
      .array()
      .of(yup.object({ id: yup.number(), name: yup.string() })),
    analysisProfile: yup
      .object()
      .shape({ id: yup.number(), name: yup.string() })
      .nullable(),
  });

  const {
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<TargetProfileFormValues>({
    defaultValues: {
      name: profile?.name ?? "",
      generators: refsToItems(generators, profile?.generators),
      analysisProfile: findProfileById(profile?.analysisProfile?.id) ?? null,
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const submitToOnSave = (values: TargetProfileFormValues) => {
    if (!generators) return;

    const newProfile: TargetProfile = {
      id: profile?.id ?? 0,
      name: values.name,
      generators: toRefs(values.generators),
      analysisProfile: toRef(values.analysisProfile ?? undefined),
    };

    onSave(newProfile);
  };

  return (
    <TargetProfileModal
      profile={profile}
      onCancel={onCancel}
      body={
        <Form id={FORM_ID} onSubmit={handleSubmit(submitToOnSave)}>
          <HookFormPFTextInput
            control={control}
            name="name"
            label={t("terms.name")}
            fieldId="target-profile-name"
            isRequired
          />

          <HookFormPFGroupController
            control={control}
            name="generators"
            label={t("terms.generators")}
            labelIcon={
              <Popover bodyContent={t("agentic.archetype.generatorsHelp")}>
                <FormGroupLabelHelp
                  aria-label={t("agentic.archetype.generatorsHelpLabel")}
                />
              </Popover>
            }
            fieldId="target-profile-generators"
            renderInput={({ field: { value: chosenGenerators, onChange } }) => (
              <DualListSelector
                allOptions={generators.map(({ name }) => name)}
                chosenOptions={chosenGenerators?.map(({ name }) => name) ?? []}
                onChange={(newGenerators) =>
                  onChange(
                    generators.filter((g) => newGenerators.includes(g.name))
                  )
                }
                allOptionsTitle={t("message.generatorsAvailable")}
                chosenOptionsTitle={t("message.generatorsChosen")}
              />
            )}
          />

          <HookFormPFGroupController
            control={control}
            name="analysisProfile"
            label={t("terms.analysisProfile")}
            labelIcon={
              <Popover bodyContent={t("agentic.archetype.analysisProfileHelp")}>
                <FormGroupLabelHelp
                  aria-label={t("agentic.archetype.analysisProfileHelpLabel")}
                />
              </Popover>
            }
            fieldId="target-profile-analysis-profile"
            renderInput={({ field: { value, onChange } }) => (
              <TypeaheadSelect
                toggleId="analysis-profile-select-toggle"
                placeholderText={t(
                  "agentic.archetype.analysisProfilePlaceholder"
                )}
                toggleAriaLabel={t("terms.analysisProfile")}
                ariaLabel={t("terms.analysisProfile")}
                inputAriaLabel={t("terms.analysisProfile")}
                value={value ? value?.id.toString() : undefined}
                options={analysisProfileOptions}
                onSelect={(selectedId) =>
                  onChange(
                    selectedId
                      ? (findProfileById(Number(selectedId)) ?? null)
                      : null
                  )
                }
              />
            )}
          />
        </Form>
      }
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            id="submit"
            variant="primary"
            isDisabled={!isValid || !isDirty}
          >
            {profile ? t("actions.save") : t("actions.create")}
          </Button>
          <Button variant="link" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
        </>
      }
    />
  );
};

export default TargetProfileForm;
