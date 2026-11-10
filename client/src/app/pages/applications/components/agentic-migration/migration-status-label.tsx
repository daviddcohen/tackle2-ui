import * as React from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@patternfly/react-core";

import {
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  getMigrationDisplayStatus,
} from "@app/agentic";

const statusColors: Record<
  ApplicationMigrationDisplayStatus,
  "blue" | "green" | "orange" | "red" | "grey"
> = {
  notConfigured: "grey",
  preflightReady: "blue",
  preflightBlocked: "red",
  reviewRequired: "orange",
  pending: "blue",
  running: "blue",
  actionRequired: "orange",
  succeeded: "green",
  failed: "red",
};

export const MigrationStatusLabel: React.FC<{
  migration: ApplicationMigrationView;
}> = ({ migration }) => {
  const { t } = useTranslation();
  const status = getMigrationDisplayStatus(migration);
  return (
    <Label color={statusColors[status]} isCompact>
      {t(`agentic.execution.displayStatus.${status}`)}
    </Label>
  );
};
