import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  HelperText,
  HelperTextItem,
  Progress,
  Skeleton,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { AgentRunUsage, ControllerRunPhase } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";

import {
  contextPercent,
  formatPercent,
  formatTokens,
  hasUsageReading,
  isContextNearlyFull,
} from "./usage-format";

/** What the context usage of one stage can show. */
interface ContextUsageSource {
  /** The stage's status: Pending has no agent run; "nearly full" is said only while Running. */
  phase: ControllerRunPhase;
  /**
   * The agent run's usage; absent or without a window means "Not reported".
   * A running stage without any reading has not reported yet.
   */
  usage?: AgentRunUsage;
  /** The agent runs are still loading. */
  isLoading?: boolean;
  /** The agent runs could not be read. */
  isUnavailable?: boolean;
}

/** "121K of 200K tokens (61%)", plus the peak once the stage is not running. */
const useContextLabel = () => {
  const { t } = useTranslation();
  return (usage: AgentRunUsage, percent: number, phase: ControllerRunPhase) => {
    const values = {
      used: formatTokens(usage.contextUsed ?? 0),
      size: formatTokens(usage.contextSize ?? 0),
      percent: formatPercent(percent),
    };
    // The peak adds something only when it differs from the last value.
    const peak =
      usage.peakContextUsed != null
        ? formatTokens(usage.peakContextUsed)
        : undefined;
    return phase !== "Running" && peak != null && peak !== values.used
      ? t("agentic.agentRun.context.labelWithPeak", { ...values, peak })
      : t("agentic.agentRun.context.label", values);
  };
};

/**
 * A running stage whose agent run has not reported any usage reading yet.
 * Decided from the data, not from a timestamp: a backend
 * that reports usage only when the run ends (today's harness) says "Not
 * reported yet" for the whole run, and promises no update.
 */
export const hasNoUsageYet = (
  phase: ControllerRunPhase,
  usage: AgentRunUsage | undefined
) => phase === "Running" && !hasUsageReading(usage);

export type ContextUsageValueProps = ContextUsageSource;

/**
 * The value of the stage's "Context window" fact: the
 * reading as plain text, "121K of 200K tokens (61%)" plus the peak once the
 * stage stopped running, over a small neutral bar named "Context window"
 * like its term. While the stage runs at 95 % or more a helper line under
 * the bar says "Context nearly full."; the term's help explains the rest.
 * Loading, a failed read and a missing reading use the same words and look
 * as the other agent run facts, with no empty bar. A Pending stage has no
 * agent run yet, so nothing renders.
 */
export const ContextUsageValue: React.FC<ContextUsageValueProps> = ({
  phase,
  usage,
  isLoading,
  isUnavailable,
}) => {
  const { t } = useTranslation();
  const contextLabel = useContextLabel();
  const helperId = `context-usage-help-${React.useId().replace(/:/g, "")}`;
  if (phase === "Pending") return null;

  if (isLoading) {
    return (
      <Skeleton
        fontSize="sm"
        width="8ch"
        screenreaderText={t("agentic.stageRun.loadingValue")}
      />
    );
  }
  if (hasNoUsageYet(phase, usage) && !isUnavailable) {
    return <EmptyTextMessage message={t("agentic.agentRun.notReportedYet")} />;
  }
  const percent = contextPercent(usage);
  if (percent == null || usage == null) {
    return (
      <EmptyTextMessage
        message={
          isUnavailable
            ? t("agentic.common.unavailable")
            : t("agentic.agentRun.context.notReported")
        }
      />
    );
  }

  const reading = contextLabel(usage, percent, phase);
  const nearlyFull = isContextNearlyFull(percent, phase);
  return (
    <Stack hasGutter>
      <StackItem>{reading}</StackItem>
      <StackItem>
        <Progress
          size="sm"
          measureLocation="none"
          value={percent}
          valueText={reading}
          aria-label={t("agentic.agentRun.context.title")}
          aria-describedby={nearlyFull ? helperId : undefined}
        />
        {/* Not the Progress helperText: in the single-line layout that
            slot sits a full row gap under the bar. */}
        {nearlyFull && (
          <HelperText className={spacing.mtSm}>
            <HelperTextItem id={helperId}>
              {t("agentic.agentRun.context.nearlyFull")}
            </HelperTextItem>
          </HelperText>
        )}
      </StackItem>
    </Stack>
  );
};

export interface ContextUsageCellProps extends ContextUsageSource {
  /** The stage's name, for the bar's accessible name. */
  stageName: string;
  /**
   * A stage of a run on several applications: `usage` is the fullest agent
   * run's, and the cell reads "Up to {highest}", with "({reported} of
   * {applications} reported)" while not every application reported. The
   * accessible value adds the lowest reading.
   */
  several?: { lowestPercent: number; reported: number; applications: number };
}

/**
 * The context window of one stage in a table cell: a small bar
 * with the percentage, neutral like the stage page's bar, and the
 * tokens in the accessible value. "Not started" for a Pending stage,
 * "Not reported yet" until a running stage reports any usage, "Not
 * reported" when the run does not meter its context.
 */
export const ContextUsageCell: React.FC<ContextUsageCellProps> = ({
  stageName,
  phase,
  usage,
  isLoading,
  isUnavailable,
  several,
}) => {
  const { t } = useTranslation();
  const contextLabel = useContextLabel();
  if (phase === "Pending") {
    return <EmptyTextMessage message={t("terms.notStarted")} />;
  }
  if (isLoading) {
    return (
      <Skeleton
        fontSize="sm"
        screenreaderText={t("agentic.agentRun.context.loading")}
      />
    );
  }
  if (hasNoUsageYet(phase, usage) && !isUnavailable) {
    return <EmptyTextMessage message={t("agentic.agentRun.notReportedYet")} />;
  }
  const percent = contextPercent(usage);
  if (percent == null || usage == null) {
    return (
      <EmptyTextMessage
        message={
          isUnavailable
            ? t("agentic.common.unavailable")
            : t("agentic.agentRun.context.notReported")
        }
      />
    );
  }
  const severalValues =
    several != null
      ? {
          lowest: formatPercent(several.lowestPercent),
          highest: formatPercent(percent),
          reported: several.reported,
          applications: several.applications,
        }
      : undefined;
  const isPartial = several != null && several.reported < several.applications;
  const hasLowest =
    several != null &&
    several.reported > 1 &&
    several.lowestPercent !== percent;
  return (
    <Progress
      size="sm"
      measureLocation="outside"
      value={percent}
      label={
        severalValues == null
          ? formatPercent(percent)
          : isPartial
            ? t("agentic.agentRun.context.upToPartial", severalValues)
            : t("agentic.agentRun.context.upTo", severalValues)
      }
      valueText={
        severalValues == null
          ? contextLabel(usage, percent, phase)
          : // The lowest adds nothing for one reading or equal readings.
            hasLowest
            ? isPartial
              ? t("agentic.agentRun.context.upToValuePartial", severalValues)
              : t("agentic.agentRun.context.upToValue", severalValues)
            : isPartial
              ? t(
                  "agentic.agentRun.context.upToValuePartialNoLowest",
                  severalValues
                )
              : t("agentic.agentRun.context.upToValueNoLowest", severalValues)
      }
      aria-label={t("agentic.agentRun.context.cellLabel", {
        stage: stageName,
      })}
    />
  );
};
