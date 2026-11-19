import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  Progress,
  Skeleton,
} from "@patternfly/react-core";

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

export type ContextUsageProps = ContextUsageSource;

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

/**
 * The stage's context window under the status line:
 * a neutral titled `Progress` with "121K of 200K tokens (61%)", and
 * the peak once the stage stopped running. While the stage runs the bar
 * always has a helper line, "The agent compacts its context automatically
 * when it gets full.", which says "Context nearly full." from 95 %: crossing
 * the threshold changes a word, not the height of the row.
 * While the runs load, and until a running stage reports any usage, the
 * same bar shell holds the row at its final height.
 * A Pending stage has no agent run yet, so nothing renders.
 */
export const ContextUsage: React.FC<ContextUsageProps> = ({
  phase,
  usage,
  isLoading,
  isUnavailable,
}) => {
  const { t } = useTranslation();
  const contextLabel = useContextLabel();
  const helperId = `context-usage-help-${React.useId().replace(/:/g, "")}`;
  if (phase === "Pending") return null;

  const title = t("agentic.agentRun.context.title");
  const percent = contextPercent(usage);
  const isRunning = phase === "Running";
  const nearlyFull = percent != null && isContextNearlyFull(percent, phase);
  const helperText = isRunning ? (
    <HelperText>
      <HelperTextItem id={helperId}>
        {nearlyFull
          ? t("agentic.agentRun.context.nearlyFull")
          : t("agentic.agentRun.context.compactsAutomatically")}
      </HelperTextItem>
    </HelperText>
  ) : undefined;
  const shell = (label: React.ReactNode, valueText: string) => (
    <Grid>
      <GridItem md={8} lg={6} xl={5}>
        <Progress
          size="sm"
          title={title}
          value={0}
          label={label}
          valueText={valueText}
          aria-describedby={isRunning ? helperId : undefined}
          helperText={helperText}
        />
      </GridItem>
    </Grid>
  );

  if (isLoading) {
    return shell(
      <Skeleton fontSize="sm" width="16ch" />,
      t("agentic.agentRun.context.loading")
    );
  }
  if (hasNoUsageYet(phase, usage) && !isUnavailable) {
    // The same words and look as the usage facts and the Stages table.
    const notReportedYet = t("agentic.agentRun.notReportedYet");
    return shell(<EmptyTextMessage message={notReportedYet} />, notReportedYet);
  }
  if (percent == null || usage == null) {
    return (
      <Flex
        spaceItems={{ default: "spaceItemsMd" }}
        alignItems={{ default: "alignItemsBaseline" }}
      >
        <FlexItem>
          <Content component="p">{title}</Content>
        </FlexItem>
        <FlexItem>
          <EmptyTextMessage
            message={
              isUnavailable
                ? t("agentic.common.unavailable")
                : t("agentic.agentRun.context.notReported")
            }
          />
        </FlexItem>
      </Flex>
    );
  }

  const label = contextLabel(usage, percent, phase);
  return (
    <Grid>
      <GridItem md={8} lg={6} xl={5}>
        <Progress
          size="sm"
          title={title}
          value={percent}
          label={label}
          valueText={label}
          aria-describedby={isRunning ? helperId : undefined}
          helperText={helperText}
        />
      </GridItem>
    </Grid>
  );
};

export interface ContextUsageCellProps extends ContextUsageSource {
  /** The stage's name, for the bar's accessible name. */
  stageName: string;
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
  return (
    <Progress
      size="sm"
      measureLocation="outside"
      value={percent}
      label={formatPercent(percent)}
      valueText={contextLabel(usage, percent, phase)}
      aria-label={t("agentic.agentRun.context.cellLabel", {
        stage: stageName,
      })}
    />
  );
};
