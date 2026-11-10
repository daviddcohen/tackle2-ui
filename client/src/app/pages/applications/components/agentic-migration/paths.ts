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

/**
 * Where a migration path is configured: an archetype's target profiles (where
 * a Plan is assigned), or the Plan list for an application without archetype.
 */
export const migrationPathConfigurationPath = (archetypeId?: number) =>
  archetypeId != null
    ? generatePath(DevPaths.archetypeTargetProfiles, {
        archetypeId: String(archetypeId),
      })
    : DevPaths.migrationPlans;
