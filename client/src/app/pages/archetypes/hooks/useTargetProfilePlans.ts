import * as React from "react";

import { isAgenticEnabled } from "@app/Constants";
import type { MigrationPlan } from "@app/agentic";
import { useFetchMigrationPlans } from "@app/queries/agentic";

/**
 * The one source for the migration plan assigned to each target profile of
 * an archetype, shared by the drawer Target profiles tab and the target
 * profiles page so the two never disagree (archetypes residual).
 *
 * "Assigned" means the default plan: a plan whose migration
 * path is the default for the archetype and lists the profile. Only that
 * plan resolves to applications, so archetype surfaces show only it.
 *
 * Without the agentic API there is no plans query.
 */
export const useTargetProfilePlans = (archetypeId: number | undefined) => {
  const { migrationPlans, isLoading, isSuccess, fetchError } =
    useFetchMigrationPlans({
      enabled: isAgenticEnabled && archetypeId != null,
    });

  const getAssignedPlan = React.useCallback(
    (profileId: number): MigrationPlan | undefined =>
      migrationPlans.find(
        (plan) =>
          plan.migrationPath?.isDefault &&
          plan.migrationPath.archetype.id === archetypeId &&
          plan.migrationPath.targetProfiles.some(
            (targetProfile) => targetProfile.id === profileId
          )
      ),
    [archetypeId, migrationPlans]
  );

  /** Plans that can be assigned to a profile of this archetype. */
  const eligiblePlans = React.useMemo(
    () =>
      migrationPlans.filter(
        (plan) =>
          !plan.migrationPath || plan.migrationPath.archetype.id === archetypeId
      ),
    [archetypeId, migrationPlans]
  );

  return {
    getAssignedPlan,
    eligiblePlans,
    isLoading,
    isSuccess,
    isError: fetchError != null,
  };
};
