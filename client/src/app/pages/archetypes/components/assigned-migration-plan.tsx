import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Skeleton } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import type { MigrationPlan } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";

export interface AssignedMigrationPlanProps {
  plan: MigrationPlan | undefined;
  /** The plans query has not answered yet: never read that as "Not assigned". */
  isLoading?: boolean;
  isError: boolean;
  /** The server does not report which profile uses a plan. */
  isUnknown?: boolean;
  linkTo: (pathname: string) => LocationDescriptor;
}

/** The migration plan assigned to a target profile, as a table cell. */
export const AssignedMigrationPlan: React.FC<AssignedMigrationPlanProps> = ({
  plan,
  isLoading,
  isError,
  isUnknown,
  linkTo,
}) => {
  const { t } = useTranslation();
  if (isLoading) return <Skeleton screenreaderText={t("terms.loading")} />;
  if (isError || isUnknown)
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  if (!plan)
    return <EmptyTextMessage message={t("agentic.archetype.notAssigned")} />;
  return (
    <Link
      to={linkTo(
        generatePath(DevPaths.migrationPlanDetails, { planId: plan.id })
      )}
    >
      {plan.name}
    </Link>
  );
};
