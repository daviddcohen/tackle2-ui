import { useTranslation } from "react-i18next";

import { EntityId, MigrationPlan } from "@app/agentic";

/**
 * Plans with at least one Stage assigned to the Agent. The server refuses to
 * delete an Agent while this is non-empty (409), so the list and the detail
 * page disable Delete with the same rule.
 */
export const getPlansUsingAgent = (
  agentId: EntityId,
  plans: MigrationPlan[]
): MigrationPlan[] =>
  plans.filter((plan) =>
    plan.stages.some((stage) => stage.agent?.id === agentId)
  );

/**
 * Why Delete is disabled, from the number of plans using the agent:
 * undefined while that is unknown (the plans query is loading or failed),
 * so Delete is never enabled on a guess. No reason when it is unused.
 */
export const useAgentDeleteBlockedReason = () => {
  const { t } = useTranslation();
  return (planCount: number | undefined): string | undefined =>
    planCount == null
      ? t("agentic.common.usageUnchecked")
      : planCount > 0
        ? t("agentic.agent.deleteInUse", { count: planCount })
        : undefined;
};
