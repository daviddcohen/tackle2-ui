import * as React from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@patternfly/react-core";

import { ControllerRunPhase } from "@app/agentic";

interface RunStatusLabelProps {
  status: ControllerRunPhase;
  isCompact?: boolean;
}

const statusColor: Record<
  ControllerRunPhase,
  "grey" | "blue" | "green" | "red" | "orange"
> = {
  Pending: "grey",
  Running: "blue",
  Succeeded: "green",
  Failed: "red",
  AwaitingApproval: "orange",
};

const statusI18nKey: Record<ControllerRunPhase, string> = {
  Pending: "agentic.runStatus.pending",
  Running: "agentic.runStatus.running",
  Succeeded: "agentic.runStatus.succeeded",
  Failed: "agentic.runStatus.failed",
  AwaitingApproval: "agentic.runStatus.awaitingApproval",
};

export const RunStatusLabel: React.FC<RunStatusLabelProps> = ({
  status,
  isCompact = true,
}) => {
  const { t } = useTranslation();
  const color = statusColor[status] ?? "grey";
  const label = statusI18nKey[status] ? t(statusI18nKey[status]) : status;
  return (
    <Label color={color} isCompact={isCompact}>
      {label}
    </Label>
  );
};
