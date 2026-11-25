import * as React from "react";

import { isAgenticEnabled } from "@app/Constants";
import type { MigrationPlan } from "@app/agentic";
import { useFetchMigrationPlans } from "@app/queries/agentic";

/**
 * The one source for the migration plan each target profile of an archetype
 * uses, shared by the drawer Target profiles tab and the target profiles
 * page so the two never disagree (archetypes residual): the plan whose
 * `migrationPaths` lists the profile. Any plan can be assigned to any
 * target profile: profiles of several archetypes can share one.
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
      migrationPlans.find((plan) =>
        (plan.migrationPaths ?? []).some(
          ({ targetProfile }) => targetProfile.id === profileId
        )
      ),
    [migrationPlans]
  );

  return {
    getAssignedPlan,
    migrationPlans,
    isLoading,
    isSuccess,
    isError: fetchError != null,
  };
};
