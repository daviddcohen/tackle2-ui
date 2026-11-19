import { TFunction } from "i18next";

import { MigrationPlan } from "@app/agentic";
import type { PreflightFixedPlan } from "@app/pages/applications/components/agentic-migration/migration-preflight-modal";

/**
 * Why "Run migration plan" is off for a plan, or undefined when the plan can
 * run. The list row menu, the plan page Actions menu and the Runs tab empty
 * state show the same text. The first that applies wins: no migration path
 * (it has no applications of its own), no stages, no applications, and
 * applications not reported. A model that is not verified does not block:
 * each application's readiness in the dialog covers it, and the plan's
 * configuration marker still warns. `canEditPlans` adds the edit fix only for
 * a user who can take it.
 */
export const getRunBlocker = (
  plan: MigrationPlan,
  canEditPlans: boolean,
  t: TFunction
): string | undefined => {
  const path = plan.migrationPath;
  if (path == null) return t("agentic.plan.runBlocked.notAssigned");
  if (plan.stages.length === 0) {
    // The edit fix only for a user who can take it (a managed plan's Edit is off).
    return canEditPlans && !plan.operatorManaged
      ? t("agentic.plan.runBlocked.noStagesEdit")
      : t("agentic.plan.runBlocked.noStages");
  }
  const impact = plan.applicationImpact;
  if (impact?.matching === 0 || impact?.applications?.length === 0) {
    return t("agentic.plan.runBlocked.noApplications", {
      archetype: path.archetype.name,
    });
  }
  if (impact?.applications == null) {
    return t("agentic.plan.runBlocked.unavailable");
  }
  return undefined;
};

/**
 * The fixed plan the Run migration plan dialog runs when opened from `plan`,
 * with its target profile (one per archetype; the first if the server lists
 * more).
 */
export const preflightPlanOf = (plan: MigrationPlan): PreflightFixedPlan => ({
  id: plan.id,
  name: plan.name,
  targetProfile: plan.migrationPath?.targetProfiles[0]?.name,
});
