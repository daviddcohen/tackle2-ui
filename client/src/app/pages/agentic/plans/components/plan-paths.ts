import { LocationDescriptorObject } from "history";
import { generatePath } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import { EntityId } from "@app/agentic";
import { serializeFilterUrlParams } from "@app/hooks/table-controls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

/** A migration plan's page, optionally on its Runs tab. */
export const planPath = (planId: EntityId, tab?: "runs") =>
  `${generatePath(DevPaths.migrationPlanDetails, { planId })}${tab != null ? `?tab=${tab}` : ""}`;

/**
 * The inventory filtered by the Migration plan filter: exactly the
 * applications counted in `applicationImpact.matching`. The filter is set
 * even when the inventory is an ancestor crumb, whose saved view would
 * otherwise come back without it.
 */
export const planApplicationsLocation = (
  planId: EntityId,
  trail: BreadcrumbEntry[]
): LocationDescriptorObject => ({
  ...breadcrumbTo(DevPaths.applications, "", trail),
  search: `?${new URLSearchParams({
    filters:
      serializeFilterUrlParams({ migrationPlan: [planId] }).filters ?? "",
  })}`,
});
