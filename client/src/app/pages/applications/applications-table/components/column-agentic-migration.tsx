import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@patternfly/react-core";

import {
  ApplicationMigrationDisplayStatus,
  ApplicationMigrationView,
  getMigrationDisplayStatus,
} from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { MigrationStatus } from "@app/pages/agentic/components/agentic-status";

import {
  MIGRATION_TAB_SEARCH,
  applicationDetailsPath,
} from "../../components/agentic-migration/paths";

/** Statuses whose second line says where the run is: "{plan} · {stage}". */
const IN_RUN: ApplicationMigrationDisplayStatus[] = [
  "pending",
  "running",
  "actionRequired",
];
/** Statuses whose second line is the server's reason they cannot start. */
const BEFORE_START: ApplicationMigrationDisplayStatus[] = [
  "preflightBlocked",
  "reviewRequired",
];

interface ColumnAgenticMigrationProps {
  /** Undefined while the migrations load or when they could not be read. */
  migration?: ApplicationMigrationView;
  isLoading: boolean;
  applicationId: number;
  /** Builds a link that carries the inventory's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}

/**
 * The inventory Migration cell: the status,
 * linked to the application's Migration tab, and at most one subtle second
 * line. Pending, running and action required say "{plan} · {stage}"; Blocked
 * and Review before start show the server's reason verbatim, never linked.
 */
export const ColumnAgenticMigration: React.FC<ColumnAgenticMigrationProps> = ({
  migration,
  isLoading,
  applicationId,
  linkTo,
}) => {
  const { t } = useTranslation();

  if (!migration) {
    return isLoading ? (
      <Skeleton screenreaderText={t("terms.loading")} />
    ) : (
      <EmptyTextMessage message={t("agentic.common.unavailable")} />
    );
  }

  const status = getMigrationDisplayStatus(migration);
  let supportingText: string | undefined;
  if (IN_RUN.includes(status) && migration.plan) {
    supportingText = migration.currentStage
      ? t("agentic.execution.planStage", {
          plan: migration.plan.name,
          stage: migration.currentStage,
        })
      : migration.plan.name;
  } else if (BEFORE_START.includes(status)) {
    supportingText = migration.preflightReason;
  }

  return (
    <MigrationStatus
      status={status}
      to={linkTo(applicationDetailsPath(applicationId), MIGRATION_TAB_SEARCH)}
      supportingText={supportingText}
    />
  );
};
