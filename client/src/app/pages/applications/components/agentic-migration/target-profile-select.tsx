import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
} from "@patternfly/react-core";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";

import { ApplicationMigrationPath } from "@app/agentic";
import { Ref } from "@app/api/models";

export interface TargetProfileSelectProps {
  application: Ref;
  /** Two or more target profiles the application can run on, in order. */
  candidates: ApplicationMigrationPath[];
  /** The profile picked (or preselected); undefined while one is required. */
  selectedId?: number;
  /**
   * "Use each application's migration plan": each option says the plan it
   * runs, and a profile without an assigned plan cannot be picked.
   */
  showsPlans: boolean;
  onSelect: (targetProfileId: number) => void;
}

/**
 * The compact target profile picker of one row of the Run migration plan
 * dialog's readiness table. Its accessible name is "Target profile for
 * {application}" followed by the toggle's text (the picked profile or the
 * placeholder). Without a pick, a helper text says one is required (Run
 * stays disabled meanwhile). An archetype name is added to each option
 * when the candidates come from several archetypes.
 */
export const TargetProfileSelect: React.FC<TargetProfileSelectProps> = ({
  application,
  candidates,
  selectedId,
  showsPlans,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const baseId = `run-target-profile-${application.id}`;
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
    const planText = showsPlans
      ? plan != null
        ? t("agentic.runSkills.optionPlan", { plan: plan.name })
        : t("agentic.runSkills.optionNoPlan")
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
        {t("agentic.runSkills.targetProfileFor", {
          application: application.name,
        })}
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
            size="sm"
            aria-labelledby={`${labelId} ${toggleId}`}
            aria-describedby={selected == null ? helperId : undefined}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
          >
            {selected?.targetProfile.name ??
              t("agentic.runSkills.targetProfilePlaceholder")}
          </MenuToggle>
        )}
      >
        <SelectList
          aria-label={t("agentic.runSkills.targetProfileFor", {
            application: application.name,
          })}
        >
          {candidates.map((path) => (
            <SelectOption
              key={path.targetProfile.id}
              value={path.targetProfile.id}
              description={description(path)}
              isDisabled={showsPlans && path.plan == null}
            >
              {path.targetProfile.name}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
      {selected == null && (
        <HelperText id={helperId}>
          <HelperTextItem>
            {t("agentic.runSkills.targetProfileRequired")}
          </HelperTextItem>
        </HelperText>
      )}
    </>
  );
};
