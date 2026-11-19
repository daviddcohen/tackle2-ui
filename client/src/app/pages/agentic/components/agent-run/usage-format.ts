/**
 * Formatting and thresholds for an agent run's usage (context window, token
 * counts, cost), shared by the stage page and the plan run Stages table.
 *
 * Numbers use `Intl` in English, like `formatDate`: compact token counts keep
 * three significant digits ("121K", "1.29M", "48.2K").
 */
import { AgentRunUsage, ControllerRunPhase } from "@app/agentic";

const LOCALE = "en";

const compactFormat = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumSignificantDigits: 3,
});

const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 0,
});

/** A token count in compact notation: 121400 is "121K", 1290000 is "1.29M". */
export const formatTokens = (tokens: number) => compactFormat.format(tokens);

/** A whole percentage (0 to 100) as text: 61 is "61%". */
export const formatPercent = (percent: number) =>
  percentFormat.format(percent / 100);

/**
 * A cost in its currency ("$3.42"). Without a currency, or with one `Intl`
 * does not know, the plain number with two decimals.
 */
export const formatCost = (cost: number, currency?: string) => {
  if (currency != null && currency !== "") {
    try {
      return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
      }).format(cost);
    } catch {
      // An unknown currency code: fall through to the plain number.
    }
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
};

/**
 * How full the context window is, as a whole percentage from 0 to 100,
 * rounded down so the shown number and the threshold agree (94.9 % is
 * "94%" and not nearly full). Undefined when the run does not report both
 * the occupancy and the window size: "Not reported", never 0.
 */
export const contextPercent = (usage: AgentRunUsage | undefined) => {
  const used = usage?.contextUsed;
  const size = usage?.contextSize;
  if (used == null || size == null || size <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.floor((used / size) * 100)));
};

/**
 * Close to the limit: a compaction may no longer free enough room. From here
 * a running stage says so under its bar.
 */
const CONTEXT_NEARLY_FULL_PERCENT = 95;

/**
 * True when the "nearly full" helper text shows: the stage is Running and
 * its context is at 95 % or more. The bar itself stays neutral at every
 * level: PF's warning and danger variants add the "Action
 * required" and "Failed" status icons, which would contradict a Running
 * status, and a finished stage's context is not actionable.
 */
export const isContextNearlyFull = (
  percent: number,
  phase: ControllerRunPhase
) => phase === "Running" && percent >= CONTEXT_NEARLY_FULL_PERCENT;

/**
 * The run has reported a usage reading: context, tokens, turns, compactions
 * or cost. The model and the turn budget are known before the run starts,
 * so they are not readings.
 */
export const hasUsageReading = (usage: AgentRunUsage | undefined) =>
  usage != null &&
  [
    usage.contextUsed,
    usage.inputTokens,
    usage.outputTokens,
    usage.turnsUsed,
    usage.compactions,
    usage.cost,
  ].some((value) => value != null);
