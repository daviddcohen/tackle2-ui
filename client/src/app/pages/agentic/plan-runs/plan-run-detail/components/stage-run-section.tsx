import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Alert,
  Button,
  ButtonVariant,
  Content,
  ExpandableSection,
  ExpandableSectionToggle,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import {
  ControllerRunPhase,
  EntityId,
  PlanStage,
  StageRun,
} from "@app/agentic";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

import { RunStatusLabel } from "../../../components/run-status-label";
import { StageRunContent } from "../../components/stage-run-content";

interface StageRunSectionProps {
  stage: PlanStage;
  stageRun: StageRun;
  runId: EntityId;
  /** Whether the user may approve; the Approve action is hidden otherwise. */
  canApprove: boolean;
  isApproving: boolean;
  onApprove: () => void;
  runChildCrumbs: BreadcrumbEntry[];
}

/** Statuses whose details the user needs to see: they open the section. */
const needsAttention = (status: ControllerRunPhase) =>
  status === "Running" || status === "AwaitingApproval" || status === "Failed";

const StageTitle: React.FC<{ stage: PlanStage; stageRun: StageRun }> = ({
  stage,
  stageRun,
}) => (
  <Flex
    alignItems={{ default: "alignItemsCenter" }}
    gap={{ default: "gapSm" }}
    component="span"
  >
    <FlexItem component="span">
      <strong>{stage.name}</strong>
    </FlexItem>
    <FlexItem component="span">
      <RunStatusLabel status={stageRun.status} />
    </FlexItem>
  </Flex>
);

/** Links shown beside the stage title, outside the expand toggle button. */
const StageLinks: React.FC<{
  stage: PlanStage;
  runId: EntityId;
  showViewRun: boolean;
  runChildCrumbs: BreadcrumbEntry[];
}> = ({ stage, runId, showViewRun, runChildCrumbs }) => {
  const { t } = useTranslation();
  return (
    <>
      <FlexItem>
        <Content component="small" className={textStyles.textColorSubtle}>
          <Link
            to={breadcrumbTo(
              generatePath(DevPaths.agentDetails, { agentId: stage.agent.id }),
              `?from=run-${runId}`,
              runChildCrumbs
            )}
          >
            {stage.agent.name}
          </Link>
        </Content>
      </FlexItem>
      {showViewRun && (
        <FlexItem>
          <Content component="small">
            <Link
              to={breadcrumbTo(
                generatePath(DevPaths.stageRunDetails, {
                  runId,
                  stageId: stage.id,
                }),
                "",
                runChildCrumbs
              )}
            >
              {t("agentic.planRun.viewRun")}
            </Link>
          </Content>
        </FlexItem>
      )}
    </>
  );
};

export const StageRunSection: React.FC<StageRunSectionProps> = ({
  stage,
  stageRun,
  runId,
  canApprove,
  isApproving,
  onApprove,
  runChildCrumbs,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(
    needsAttention(stageRun.status)
  );
  // A stage that starts to need attention while the page is open (for
  // example one that now awaits approval) opens, so its action is visible.
  const [shownStatus, setShownStatus] = React.useState(stageRun.status);
  if (shownStatus !== stageRun.status) {
    setShownStatus(stageRun.status);
    if (needsAttention(stageRun.status)) setIsExpanded(true);
  }

  const toggleId = `stage-run-toggle-${runId}-${stage.id}`;
  const contentId = `stage-run-content-${runId}-${stage.id}`;

  // Pending stages carry no actionable content: a plain header row.
  if (stageRun.status === "Pending") {
    return (
      <Flex
        alignItems={{ default: "alignItemsCenter" }}
        gap={{ default: "gapSm" }}
        className={spacing.pySm}
      >
        <FlexItem>
          <StageTitle stage={stage} stageRun={stageRun} />
        </FlexItem>
        <StageLinks
          stage={stage}
          runId={runId}
          showViewRun={false}
          runChildCrumbs={runChildCrumbs}
        />
      </Flex>
    );
  }

  return (
    <>
      <Flex
        alignItems={{ default: "alignItemsCenter" }}
        gap={{ default: "gapSm" }}
      >
        <FlexItem>
          <ExpandableSectionToggle
            isExpanded={isExpanded}
            onToggle={setIsExpanded}
            toggleId={toggleId}
            contentId={contentId}
            direction="down"
          >
            <StageTitle stage={stage} stageRun={stageRun} />
          </ExpandableSectionToggle>
        </FlexItem>
        <StageLinks
          stage={stage}
          runId={runId}
          showViewRun
          runChildCrumbs={runChildCrumbs}
        />
      </Flex>
      <ExpandableSection
        isDetached
        isExpanded={isExpanded}
        toggleId={toggleId}
        contentId={contentId}
      >
        <Stack hasGutter>
          {stageRun.status === "AwaitingApproval" && (
            <StackItem>
              <Alert
                variant="warning"
                isInline
                title={t("agentic.planRun.approveTitle")}
              >
                <Stack hasGutter>
                  <StackItem>
                    {t("agentic.planRun.approveDescription", {
                      agentName: stage.agent.name,
                    })}
                  </StackItem>
                  {canApprove && (
                    <StackItem>
                      <Button
                        variant={ButtonVariant.primary}
                        isLoading={isApproving}
                        isDisabled={isApproving}
                        onClick={onApprove}
                      >
                        {t("agentic.planRun.approve")}
                      </Button>
                    </StackItem>
                  )}
                </Stack>
              </Alert>
            </StackItem>
          )}

          {stageRun.status === "Failed" && stageRun.output && (
            <StackItem>
              <Alert
                variant="danger"
                isInline
                title={t("agentic.runStatus.failed")}
              >
                {stageRun.output}
              </Alert>
            </StackItem>
          )}

          <StackItem>
            <StageRunContent
              status={stageRun.status}
              messages={stageRun.messages ?? []}
              commits={stageRun.commits ?? []}
            />
          </StackItem>
        </Stack>
      </ExpandableSection>
    </>
  );
};
