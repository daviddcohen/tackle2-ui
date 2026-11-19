import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Alert,
  AlertActionLink,
  Button,
  ButtonVariant,
  Content,
  Stack,
  StackItem,
} from "@patternfly/react-core";

import { PlanRun, StageRun, getOrderedStageRuns } from "@app/agentic";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { useLinkComponent } from "@app/hooks/useLinkComponent";

/** What a run or stage needs from a person, if anything. */
export type StageAttention =
  | { kind: "approval"; stageRun: StageRun; next?: StageRun }
  /** `stageRun` is undefined when the run failed without a failed stage. */
  | { kind: "failed"; stageRun?: StageRun }
  /** A stage page whose stage has not run: why, as an i18n key and values. */
  | { kind: "pending"; key: string; values?: Record<string, string> };

/**
 * The attention a run needs (`stageRun` omitted: the stage awaiting approval,
 * else the failed stage or the failed run), or that one stage needs on its
 * own page, where a stage that has not run also says why.
 * Only the run's own stage snapshot is read.
 */
export const getStageAttention = (
  planRun: PlanRun,
  stageRun?: StageRun
): StageAttention | undefined => {
  const ordered = getOrderedStageRuns(planRun);
  const nextOf = (stage: StageRun) =>
    ordered[ordered.findIndex((s) => s.stageId === stage.stageId) + 1];

  if (stageRun == null) {
    const awaiting = ordered.find((s) => s.status === "AwaitingApproval");
    if (awaiting) {
      return { kind: "approval", stageRun: awaiting, next: nextOf(awaiting) };
    }
    const failed = ordered.find((s) => s.status === "Failed");
    if (failed) return { kind: "failed", stageRun: failed };
    return planRun.status === "Failed" ? { kind: "failed" } : undefined;
  }

  switch (stageRun.status) {
    case "AwaitingApproval":
      return { kind: "approval", stageRun, next: nextOf(stageRun) };
    case "Failed":
      return { kind: "failed", stageRun };
    case "Pending": {
      if (planRun.status === "Failed") {
        const failed = ordered.find((s) => s.status === "Failed");
        return failed
          ? {
              kind: "pending",
              key: "agentic.stageAttention.didNotRunStageFailed",
              values: { stage: failed.name },
            }
          : {
              kind: "pending",
              key: "agentic.stageAttention.didNotRunRunFailed",
            };
      }
      const previous =
        ordered[ordered.findIndex((s) => s.stageId === stageRun.stageId) - 1];
      if (previous == null) {
        return { kind: "pending", key: "agentic.stageAttention.startsWithRun" };
      }
      return {
        kind: "pending",
        key:
          previous.requiresApproval && !previous.approvedAt
            ? "agentic.stageAttention.startsAfterApproval"
            : "agentic.stageAttention.startsAfterStage",
        values: { stage: previous.name },
      };
    }
    default:
      return undefined;
  }
};

/** The first line of raw controller output: the alert is a summary, the stage page has the rest. */
const firstLine = (output?: string) =>
  output?.split("\n")[0].trim() || undefined;

/**
 * Where the alert sits, which sets the approval body: the plan run page, a
 * stage page (its own `stageRun`) or an application's Migration tab.
 */
export type StageAttentionSurface =
  | { surface: "run" | "application"; stageRun?: undefined }
  | { surface: "stage"; stageRun: StageRun };

export type StageAttentionAlertProps = StageAttentionSurface & {
  planRun: PlanRun;
  /** Link to a stage page ("Review stage"); the stage page never links to itself. */
  reviewStageTo?: (stageRun: StageRun) => LocationDescriptor;
  /**
   * Approves the stage awaiting approval. Pass it only with
   * `agenticWorkflowRunsWriteScopes`: without it the alert says "Waiting for
   * approval." and offers no decision. Errors are the caller's to report.
   */
  onApprove?: (stageRun: StageRun) => Promise<unknown> | void;
  /** Rejects the stage and fails the run: only where a reject API exists (application Migration tab). */
  onReject?: (stageRun: StageRun) => Promise<unknown> | void;
  /** A decision is being sent. */
  isDeciding?: boolean;
  /** Opens "Run migration plan" on a failure; undefined without the scope. */
  onRunMigrationPlan?: () => void;
  /** Application tab: the failure as the application view reports it, instead of the stage output. */
  failureDetails?: { summary?: string; evidence?: string[] };
  /**
   * Application tab, failed variant: why the migration cannot run again yet
   * (the view's `preflightReason` when `preflight` is not ready). Adds "Before
   * it can run again: {reason}" before the next step.
   */
  restartBlockedReason?: string;
  /**
   * The plan run page, for a failure that names no stage: the slot that
   * otherwise holds "Review stage" reads "View plan run".
   * The run page itself passes nothing.
   */
  planRunTo?: LocationDescriptor;
  /**
   * Places the alert in the caller's layout (a page section, a stack item).
   * It is called only when there is something to show, so the caller renders
   * no empty wrapper.
   */
  wrapper?: (alert: React.ReactElement) => React.ReactElement;
};

/**
 * The one attention alert of a run, a stage or an application's migration:
 * the title names the stage, the body
 * says what happened and what to do, and the actions sit in one row inside
 * the alert. Approve and Reject always confirm first. Renders nothing when
 * `getStageAttention` finds nothing to show.
 */
export const StageAttentionAlert: React.FC<StageAttentionAlertProps> = ({
  wrapper,
  ...props
}) => {
  const attention = getStageAttention(props.planRun, props.stageRun);
  if (attention == null) return null;
  const alert = <AttentionAlert attention={attention} {...props} />;
  return wrapper != null ? wrapper(alert) : alert;
};

const AttentionAlert: React.FC<
  Omit<StageAttentionAlertProps, "wrapper" | "stageRun"> & {
    attention: StageAttention;
  }
> = ({
  attention,
  surface,
  planRun,
  reviewStageTo,
  onApprove,
  onReject,
  isDeciding = false,
  onRunMigrationPlan,
  failureDetails,
  restartBlockedReason,
  planRunTo,
}) => {
  const { t } = useTranslation();
  const [decision, setDecision] = React.useState<"approve" | "reject">();
  const stage = attention.kind === "pending" ? undefined : attention.stageRun;
  // One link slot: Review stage, or View plan run when no stage is named.
  const reviewTo =
    stage != null
      ? surface !== "stage"
        ? reviewStageTo?.(stage)
        : undefined
      : attention.kind === "failed"
        ? planRunTo
        : undefined;
  const reviewLink = useLinkComponent(reviewTo);

  if (attention.kind === "pending") {
    return (
      <Alert
        variant="info"
        isInline
        isPlain
        title={t(attention.key, attention.values)}
      />
    );
  }

  const reviewLabel =
    stage != null
      ? t("agentic.stageAttention.reviewStage")
      : t("agentic.stageAttention.viewPlanRun");
  const reviewButton = reviewLink != null && (
    <Button variant="link" component={reviewLink}>
      {reviewLabel}
    </Button>
  );
  const reviewActionLink = reviewLink != null && (
    <AlertActionLink component={reviewLink}>{reviewLabel}</AlertActionLink>
  );
  const actionRow = (buttons: React.ReactNode[]) => (
    <ActionList>
      <ActionListGroup>
        {buttons.filter(Boolean).map((button, index) => (
          <ActionListItem key={index}>{button}</ActionListItem>
        ))}
      </ActionListGroup>
    </ActionList>
  );

  if (attention.kind === "failed") {
    const hasFailureDetails =
      !!failureDetails?.summary || !!failureDetails?.evidence?.length;
    // Paragraph 1 is omitted when there is nothing to say.
    const details =
      failureDetails != null
        ? hasFailureDetails && (
            <>
              {failureDetails.summary && (
                <Content component="p">{failureDetails.summary}</Content>
              )}
              {failureDetails.evidence?.length ? (
                <Content component="ul">
                  {failureDetails.evidence.map((evidence) => (
                    <Content component="li" key={evidence}>
                      {evidence}
                    </Content>
                  ))}
                </Content>
              ) : null}
            </>
          )
        : firstLine(stage?.output) && (
            <Content component="p">{firstLine(stage?.output)}</Content>
          );
    return (
      <Alert
        variant="danger"
        isInline
        title={
          stage != null
            ? t("agentic.stageAttention.failedTitle", { stage: stage.name })
            : t("agentic.stageAttention.runFailedTitle")
        }
        actionLinks={onRunMigrationPlan == null ? reviewActionLink : undefined}
      >
        <Stack hasGutter>
          {details && <StackItem>{details}</StackItem>}
          {restartBlockedReason && (
            <StackItem>
              <Content component="p">
                {t("agentic.stageAttention.restartBlocked", {
                  reason: restartBlockedReason,
                })}
              </Content>
            </StackItem>
          )}
          <StackItem>
            <Content component="p">
              {t("agentic.stageAttention.failedNextStep")}
            </Content>
          </StackItem>
          {onRunMigrationPlan != null && (
            <StackItem>
              {actionRow([
                <Button
                  key="run"
                  variant={ButtonVariant.primary}
                  onClick={onRunMigrationPlan}
                >
                  {t("agentic.stageAttention.runMigrationPlan")}
                </Button>,
                reviewButton,
              ])}
            </StackItem>
          )}
        </Stack>
      </Alert>
    );
  }

  // Approval.
  const approvalStage = attention.stageRun;
  const next = attention.next;
  const values = {
    agent: approvalStage.agent.name,
    stage: approvalStage.name,
    next: next?.name,
    run: planRun.name,
    count: planRun.applications.length,
  };
  const approveBody = {
    run: next
      ? t("agentic.stageAttention.approveBodyRun", values)
      : t("agentic.stageAttention.approveBodyRunLast", values),
    stage: next
      ? t("agentic.stageAttention.approveBodyStage", values)
      : t("agentic.stageAttention.approveBodyStageLast", values),
    application: next
      ? t("agentic.stageAttention.decisionBody", values)
      : t("agentic.stageAttention.decisionBodyLast", values),
  };
  const body =
    onApprove == null
      ? t("agentic.stageAttention.waitingBody", values)
      : approveBody[surface];
  const scope = t("agentic.stageAttention.decisionScope", values);
  const confirm = async () => {
    const decide = decision === "reject" ? onReject : onApprove;
    try {
      await decide?.(approvalStage);
    } catch {
      // The caller reports a failed decision; the dialog only closes.
    } finally {
      setDecision(undefined);
    }
  };

  return (
    <>
      <Alert
        variant="warning"
        isInline
        title={t("agentic.stageAttention.approvalTitle", {
          stage: approvalStage.name,
        })}
        actionLinks={onApprove == null ? reviewActionLink : undefined}
      >
        <Stack hasGutter>
          <StackItem>{body}</StackItem>
          {onApprove != null && (
            <StackItem>
              {actionRow([
                <Button
                  key="approve"
                  variant={ButtonVariant.primary}
                  isLoading={isDeciding && decision !== "reject"}
                  isDisabled={isDeciding}
                  onClick={() => setDecision("approve")}
                >
                  {t("agentic.stageAttention.approve")}
                </Button>,
                onReject != null && (
                  <Button
                    key="reject"
                    variant={ButtonVariant.secondary}
                    isDisabled={isDeciding}
                    onClick={() => setDecision("reject")}
                  >
                    {t("agentic.stageAttention.reject")}
                  </Button>
                ),
                reviewButton,
              ])}
            </StackItem>
          )}
        </Stack>
      </Alert>
      <ConfirmDialog
        isOpen={decision != null}
        title={
          decision === "reject"
            ? t("agentic.stageAttention.confirmRejectTitle")
            : t("agentic.stageAttention.confirmApproveTitle")
        }
        titleIconVariant={decision === "reject" ? "warning" : undefined}
        message={
          decision === "reject"
            ? [
                t("agentic.stageAttention.confirmRejectBody", values),
                scope,
                t("agentic.stageAttention.cannotBeUndone"),
              ].join(" ")
            : [
                t(
                  next
                    ? "agentic.stageAttention.confirmApproveBody"
                    : "agentic.stageAttention.confirmApproveBodyLast",
                  values
                ),
                scope,
              ].join(" ")
        }
        confirmBtnLabel={
          decision === "reject"
            ? t("agentic.stageAttention.reject")
            : t("agentic.stageAttention.approve")
        }
        confirmBtnVariant={
          decision === "reject" ? ButtonVariant.danger : ButtonVariant.primary
        }
        cancelBtnLabel={t("actions.cancel")}
        inProgress={isDeciding}
        onCancel={() => setDecision(undefined)}
        onClose={() => setDecision(undefined)}
        onConfirm={confirm}
      />
    </>
  );
};
