import * as React from "react";
import { Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { FormGroupLabelHelp, Popover } from "@patternfly/react-core";

import type { Archetype, Ref, TargetProfile } from "@app/api/models";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { duplicateNameCheck } from "@app/utils/utils";

import { DualListSelector } from "../../../components/dual-list-selector";

import "./target-profile-fields.css";

/**
 * The fields every target profile modal works on. Create shows all three;
 * Edit, Manage generators and Assign analysis profile each show one and save
 * only that one. Generators and analysis profile are held as refs: the
 * profile may reference ones its lists no longer return.
 */
export interface TargetProfileFormValues {
  name: string;
  generators: Ref[];
  analysisProfile: Ref | null;
}

/** Ids of the first control of each field, where a modal puts focus. */
export const NAME_FIELD_ID = "target-profile-name";
export const GENERATORS_FIELD_ID = "target-profile-generators";
const ANALYSIS_PROFILE_TOGGLE_ID = "analysis-profile-select-toggle";
export const ANALYSIS_PROFILE_FIELD_ID = `${ANALYSIS_PROFILE_TOGGLE_ID}-input`;

/**
 * One schema for every target profile form, so create and the split modals
 * cannot diverge. The name is unique within the archetype, ignoring `profile`
 * itself when it is being edited.
 */
export const useTargetProfileSchema = (
  archetype: Archetype,
  profile: TargetProfile | null
) => {
  const { t } = useTranslation();
  return yup.object().shape({
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
};

interface FieldProps {
  control: Control<TargetProfileFormValues>;
}

export const TargetProfileNameField: React.FC<FieldProps> = ({ control }) => {
  const { t } = useTranslation();
  return (
    <HookFormPFTextInput
      control={control}
      name="name"
      label={t("terms.name")}
      fieldId={NAME_FIELD_ID}
      isRequired
    />
  );
};

export const TargetProfileGeneratorsField: React.FC<
  FieldProps & { generators: Ref[] }
> = ({ control, generators }) => {
  const { t } = useTranslation();
  return (
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
      fieldId={GENERATORS_FIELD_ID}
      // Two lists and their controls: the label names the group.
      formGroupProps={{ role: "group" }}
      renderInput={({ field: { value: chosenGenerators, onChange } }) => (
        <div id={GENERATORS_FIELD_ID} className="target-profile-generators">
          <DualListSelector
            allOptions={generators.map(({ name }) => name)}
            chosenOptions={chosenGenerators.map(({ name }) => name)}
            onChange={(chosenNames) =>
              onChange(
                generators.filter(({ name }) => chosenNames.includes(name))
              )
            }
            allOptionsTitle={t("message.generatorsAvailable")}
            chosenOptionsTitle={t("message.generatorsChosen")}
          />
        </div>
      )}
    />
  );
};

export const TargetProfileAnalysisProfileField: React.FC<
  FieldProps & {
    options: FilterSelectOptionProps[];
    findProfileById: (id: number | undefined) => Ref | undefined;
  }
> = ({ control, options, findProfileById }) => {
  const { t } = useTranslation();
  return (
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
      fieldId={ANALYSIS_PROFILE_FIELD_ID}
      renderInput={({ field: { value, onChange } }) => (
        // Clearing the selection means no analysis profile.
        <TypeaheadSelect
          toggleId={ANALYSIS_PROFILE_TOGGLE_ID}
          placeholderText={t("agentic.archetype.analysisProfilePlaceholder")}
          toggleAriaLabel={t("terms.analysisProfile")}
          ariaLabel={t("terms.analysisProfile")}
          inputAriaLabel={t("terms.analysisProfile")}
          value={value != null ? String(value.id) : undefined}
          options={options}
          onSelect={(selectedId) =>
            onChange(
              selectedId != null
                ? (findProfileById(Number(selectedId)) ?? null)
                : null
            )
          }
        />
      )}
    />
  );
};
