import * as React from "react";
import { CodeEditorControl } from "@patternfly/react-code-editor";
import { UndoIcon } from "@patternfly/react-icons";
import "./SimpleDocumentViewer.css";

export const RefreshControl: React.FC<{
  refetch: () => void;
  isVisible: boolean;
  /** Accessible name; defaults to the Task details one. */
  ariaLabel?: string;
  /** Tooltip text; defaults to "Refresh". */
  tooltip?: string;
}> = ({
  refetch,
  isVisible,
  ariaLabel = "refresh-task",
  tooltip = "Refresh",
}) => (
  <CodeEditorControl
    icon={<UndoIcon />}
    aria-label={ariaLabel}
    tooltipProps={{ content: tooltip }}
    onClick={refetch}
    isVisible={isVisible}
  />
);
