import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
} from "@patternfly/react-core";
import display from "@patternfly/react-styles/css/utilities/Display/display";

import { ControllerRunPhase, HubRef } from "@app/agentic";

import { statusPresentation } from "../../components/agentic-status";

export interface RunApplicationSelectProps {
  /** The run's applications, in the run's order (the options' order). */
  applications: HubRef[];
  /**
   * The application whose agent run the page shows. Undefined until it is
   * known (the agent runs load): the toggle is disabled, at its size.
   */
  selectedId?: number;
  onSelect: (applicationId: number) => void;
  /**
   * Each application's agent run status for this stage, by application id.
   * An application without one (agent runs loading or unavailable) has an
   * option without a description.
   */
  statuses?: ReadonlyMap<number, ControllerRunPhase>;
}

/**
 * The stage page's application picker in a run on several applications:
 * "Application: {name}" on the toggle, one option
 * per application in the run's order, each with its agent run's status for
 * this stage. The toggle's visible text is its accessible name; focus goes
 * back to it after a choice.
 */
export const RunApplicationSelect: React.FC<RunApplicationSelectProps> = ({
  applications,
  selectedId,
  onSelect,
  statuses,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const selected = applications.find(
    (application) => application.id === selectedId
  );
  if (selected == null) {
    return (
      <MenuToggle id="stage-application-toggle" isDisabled>
        {t("agentic.stageRun.applicationLabel", { count: 1 })}{" "}
        <Skeleton
          className={display.displayInlineBlock}
          width="12ch"
          fontSize="sm"
          screenreaderText={t("agentic.stageRun.loadingValue")}
        />
      </MenuToggle>
    );
  }
  return (
    <Select
      id="stage-application-select"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={selected.id}
      onSelect={(_event, value) => {
        setIsOpen(false);
        if (value != null && Number(value) !== selectedId) {
          onSelect(Number(value));
        }
      }}
      shouldFocusToggleOnSelect
      popperProps={{ appendTo: () => document.body }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          id="stage-application-toggle"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
        >
          {t("agentic.stageRun.application", { name: selected.name })}
        </MenuToggle>
      )}
    >
      <SelectList aria-label={t("agentic.stageRun.applicationsList")}>
        {applications.map((application) => {
          const status = statuses?.get(application.id);
          return (
            <SelectOption
              key={application.id}
              value={application.id}
              description={
                status != null
                  ? t(statusPresentation.run[status].labelKey)
                  : undefined
              }
            >
              {application.name}
            </SelectOption>
          );
        })}
      </SelectList>
    </Select>
  );
};
