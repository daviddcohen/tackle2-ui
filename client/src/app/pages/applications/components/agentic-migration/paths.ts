import { generatePath } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { EntityId } from "@app/agentic";

/** Tab key of the Migration tab on the application detail page. */
export const MIGRATION_TAB = "migration";
export const MIGRATION_TAB_SEARCH = `?tab=${MIGRATION_TAB}`;

export const applicationDetailsPath = (applicationId: number) =>
  generatePath(DevPaths.applicationDetails, {
    applicationId: String(applicationId),
  });

export const planRunPath = (runId: EntityId) =>
  generatePath(DevPaths.planRunDetails, { runId });
