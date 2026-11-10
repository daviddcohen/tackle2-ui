export type PrototypePersona =
  | "platformEngineer"
  | "enterpriseArchitect"
  | "hubMigrator";

export type PrototypeScenario =
  | "initial"
  | "partialConfiguration"
  | "configured"
  | "preflightBlocked"
  | "queued"
  | "running"
  | "actionRequired"
  | "failed"
  | "completed"
  | "loading"
  | "apiError";

export const PROTOTYPE_FIXTURE_RESET_EVENT = "konveyor:prototype-fixture-reset";

export interface PrototypeState {
  persona: PrototypePersona;
  scenario: PrototypeScenario;
  /** 1-indexed stage number shown as active in execution scenarios. Default 1. */
  stageIndex: number;
}
