import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Button } from "@patternfly/react-core";

import { ApplicationMigrationView } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { plansWriteScopes } from "@app/scopes";

import { getMigrationNextAction } from "./next-action";
import {
  MIGRATION_TAB_SEARCH,
  applicationDetailsPath,
  migrationPathConfigurationPath,
  planRunPath,
} from "./paths";

export interface MigrationNextActionProps {
  migration: ApplicationMigrationView;
  applicationId: number;
  /** The application's archetype, where its migration path is configured. */
  archetypeId?: number;
  /** Builds a link that carries the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  /** Opens preflight for this application. Omit when the user cannot start runs. */
  onStart?: () => void;
  /**
   * Replaces navigation to the Migration tab, for callers that already show
   * it (for example to move focus to the section that holds the action).
   */
  onOpenMigrationTab?: () => void;
}

/**
 * The application's next migration action. It is an action, not a reference
 * to an entity, so it renders as a (link-styled) button whatever it does:
 * open preflight, or navigate to where the action is taken.
 */
export const MigrationNextAction: React.FC<MigrationNextActionProps> = ({
  migration,
  applicationId,
  archetypeId,
  linkTo,
  onStart,
  onOpenMigrationTab,
}) => {
  const { t } = useTranslation();
  const history = useHistory();
  // Configuring a migration path assigns a Plan to a target profile.
  const canConfigure = useHasSomeScopes(plansWriteScopes);
  const action = getMigrationNextAction(migration);
  const label = t(`agentic.execution.nextActions.${action.key}`);

  const onClick = ((): (() => void) | undefined => {
    switch (action.target) {
      case "configure":
        return canConfigure
          ? () =>
              history.push(linkTo(migrationPathConfigurationPath(archetypeId)))
          : undefined;
      case "preflight":
        return onStart;
      case "planRun": {
        const { planRunId } = action;
        return planRunId != null
          ? () => history.push(linkTo(planRunPath(planRunId)))
          : undefined;
      }
      case "migrationTab":
        return (
          onOpenMigrationTab ??
          (() =>
            history.push(
              linkTo(
                applicationDetailsPath(applicationId),
                MIGRATION_TAB_SEARCH
              )
            ))
        );
    }
  })();

  // Without a permitted action (for example no right to start runs or
  // to configure Plans) the next
  // action is information only.
  return onClick ? (
    <Button variant="link" isInline onClick={onClick}>
      {label}
    </Button>
  ) : (
    <>{label}</>
  );
};
