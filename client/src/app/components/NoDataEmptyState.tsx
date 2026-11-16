import * as React from "react";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateVariant,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

export interface NoDataEmptyStateProps {
  title: string;
  description?: string;
  /** The next step, for example the primary create button. */
  actions?: React.ReactNode;
}

export const NoDataEmptyState: React.FC<NoDataEmptyStateProps> = ({
  title,
  description,
  actions,
}) => {
  return (
    <EmptyState
      headingLevel="h2"
      icon={CubesIcon}
      titleText={title}
      variant={EmptyStateVariant.sm}
    >
      {description && <EmptyStateBody>{description}</EmptyStateBody>}
      {actions && (
        <EmptyStateFooter>
          <EmptyStateActions>{actions}</EmptyStateActions>
        </EmptyStateFooter>
      )}
    </EmptyState>
  );
};
