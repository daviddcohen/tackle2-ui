import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Content, Spinner, Stack, StackItem } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { ApplicationMigrationView } from "@app/agentic";

import { MigrationNextAction } from "../../components/agentic-migration/migration-next-action";
import { MigrationStatusLabel } from "../../components/agentic-migration/migration-status-label";

interface ColumnAgenticMigrationProps {
  /** Undefined while the migrations load or when they could not be read. */
  migration?: ApplicationMigrationView;
  isLoading: boolean;
  applicationId: number;
  archetypeId?: number;
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  /** Opens preflight for this application; omitted when the user cannot start runs. */
  onStart?: () => void;
}

export const ColumnAgenticMigration: React.FC<ColumnAgenticMigrationProps> = ({
  migration,
  isLoading,
  applicationId,
  archetypeId,
  linkTo,
  onStart,
}) => {
  const { t } = useTranslation();

  if (!migration) {
    return isLoading ? (
      <Spinner size="md" aria-label={t("agentic.execution.loadingMigration")} />
    ) : (
      <Content component="small">
        {t("agentic.execution.migrationUnavailable")}
      </Content>
    );
  }

  return (
    <Stack>
      <StackItem>
        <MigrationStatusLabel migration={migration} />
      </StackItem>
      {migration.plan && (
        <StackItem>
          <Content component="small">
            <Link
              to={linkTo(
                DevPaths.migrationPlanDetails.replace(
                  ":planId",
                  migration.plan.id
                )
              )}
            >
              {migration.plan.name}
            </Link>
            {migration.currentStage
              ? `, ${t("agentic.execution.currentStage", {
                  stage: migration.currentStage,
                })}`
              : null}
          </Content>
        </StackItem>
      )}
      <StackItem>
        <Content component="small">
          {t("agentic.execution.nextPrefix")}{" "}
          <MigrationNextAction
            migration={migration}
            applicationId={applicationId}
            archetypeId={archetypeId}
            linkTo={linkTo}
            onStart={onStart}
          />
        </Content>
      </StackItem>
    </Stack>
  );
};
