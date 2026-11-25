import { LocationDescriptorObject } from "history";

import { DevPaths } from "@app/Paths";
import { serializeFilterUrlParams } from "@app/hooks/table-controls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

/** The URL prefix of the `/plan-runs` list's view state (filters, sort, page). */
export const planRunsPersistenceKeyPrefix = "planRuns";

/** The list's Archetype filter: runs that include an application of the archetype. */
export const planRunsArchetypeFilterKey = "archetype";

/**
 * The plan runs list filtered by the Archetype filter: exactly the runs
 * counted with `runTouchesArchetype`. The filter is set even when the list is
 * an ancestor crumb, whose saved view would otherwise come back without it.
 */
export const archetypePlanRunsLocation = (
  archetypeId: number,
  trail: BreadcrumbEntry[]
): LocationDescriptorObject => ({
  ...breadcrumbTo(DevPaths.planRuns, "", trail),
  search: `?${new URLSearchParams({
    [`${planRunsPersistenceKeyPrefix}:filters`]:
      serializeFilterUrlParams({
        [planRunsArchetypeFilterKey]: [String(archetypeId)],
      }).filters ?? "",
  })}`,
});
