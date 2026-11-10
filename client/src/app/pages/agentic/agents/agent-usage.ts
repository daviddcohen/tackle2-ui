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
