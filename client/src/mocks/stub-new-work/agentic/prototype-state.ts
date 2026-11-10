/**
 * Reads the prototype switcher state from the page URL. Only the mock server
 * reads it; application code never does.
 */
import { PrototypeScenario } from "@app/prototype/agentic/types";

const scenarios: PrototypeScenario[] = [
  "initial",
  "partialConfiguration",
  "configured",
  "preflightBlocked",
  "queued",
  "running",
  "actionRequired",
  "failed",
  "completed",
  "loading",
  "apiError",
];

const isScenario = (value: string | null): value is PrototypeScenario =>
  value != null && (scenarios as string[]).includes(value);

const searchParams = () =>
  new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );

// In-app links may drop the proto params for a moment before the switcher
// restores them. Remember the last explicit values so requests made in that
// window still see the active scenario instead of the defaults.
let lastScenario: PrototypeScenario = "configured";
let lastStageIndex = 1;

export const getPrototypeScenario = (): PrototypeScenario => {
  const value = searchParams().get("protoScenario");
  if (isScenario(value)) lastScenario = value;
  return lastScenario;
};

/** Returns the 1-indexed stage number selected in the prototype switcher. */
export const getPrototypeStageIndex = (): number => {
  const raw = parseInt(searchParams().get("protoStage") ?? "", 10);
  if (Number.isFinite(raw) && raw >= 1) lastStageIndex = raw;
  return lastStageIndex;
};
