import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
} from "@patternfly/react-core";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";

import { ApplicationMigrationPath } from "@app/agentic";

export interface TargetProfileSelectProps {
  /** Unique in the dialog: the base of the select's element ids. */
  id: string;
  /** The accessible name, before the toggle's text. */
  label: string;
  /** Two or more target profiles to choose from, in order. */
  candidates: ApplicationMigrationPath[];
  /** The profile picked (or preselected); undefined while none is. */
  selectedId?: number;
  /** In a table row: the small toggle. */
  isCompact?: boolean;
  /** Without a pick, the accessible description says one is required. */
  isRequired?: boolean;
  /** "Use the migration plan of each target profile": each option says the plan it runs. */
  showsPlans: boolean;
  onSelect: (targetProfileId: number) => void;
}

/**
 * A target profile picker of the Run migration plan dialog: compact in a
 * row of the readiness table ("Target profile for {application}"), or one
 * per archetype in the form, which sets every row of that archetype. Its
 * accessible name is `label` followed by the toggle's text (the picked
 * profile or the placeholder). A required one without a pick says so in its
 * accessible description (Run stays disabled meanwhile, and the table
 * caption counts the rows that need one). An archetype name is added to
 * each option when the candidates come from several archetypes.
 */
export const TargetProfileSelect: React.FC<TargetProfileSelectProps> = ({
  id,
  label,
  candidates,
  selectedId,
  isCompact = false,
  isRequired = false,
  showsPlans,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const baseId = `run-target-profile-${id}`;
  const labelId = `${baseId}-label`;
  const toggleId = `${baseId}-toggle`;
  const helperId = `${baseId}-helper`;
  const selected = candidates.find(
    ({ targetProfile }) => targetProfile.id === selectedId
  );
  const isSeveralArchetypes = candidates.some(
    ({ archetype }) => archetype.id !== candidates[0].archetype.id
  );
  const description = ({ archetype, plan }: ApplicationMigrationPath) => {
    const archetypeText = isSeveralArchetypes
      ? t("agentic.runSkills.optionArchetype", { archetype: archetype.name })
      : undefined;
    const planText =
      showsPlans && plan != null
        ? t("agentic.runSkills.optionPlan", { plan: plan.name })
        : undefined;
    return archetypeText != null && planText != null
      ? t("agentic.runSkills.optionDetails", {
          archetype: archetypeText,
          plan: planText,
        })
      : (archetypeText ?? planText);
  };

  return (
    <>
      <span id={labelId} className={a11yStyles.screenReader}>
        {label}
      </span>
      <Select
        id={`${baseId}-select`}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        selected={selected?.targetProfile.id}
        onSelect={(_event, value) => {
          setIsOpen(false);
          if (value != null) onSelect(Number(value));
        }}
        shouldFocusToggleOnSelect
        popperProps={{ appendTo: () => document.body }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            id={toggleId}
            size={isCompact ? "sm" : "default"}
            aria-labelledby={`${labelId} ${toggleId}`}
            aria-describedby={
              isRequired && selected == null ? helperId : undefined
            }
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
          >
            {selected?.targetProfile.name ??
              t("agentic.runSkills.targetProfilePlaceholder")}
          </MenuToggle>
        )}
      >
        <SelectList aria-label={label}>
          {candidates.map((path) => (
            <SelectOption
              key={path.targetProfile.id}
              value={path.targetProfile.id}
              description={description(path)}
            >
              {path.targetProfile.name}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
      {/* The table caption says how many rows still need a pick. */}
      {isRequired && selected == null && (
        <span id={helperId} className={a11yStyles.screenReader}>
          {t("agentic.runSkills.targetProfileRequired")}
        </span>
      )}
    </>
  );
};
