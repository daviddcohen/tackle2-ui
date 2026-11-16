import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertActionLink,
  Content,
  Stack,
  StackItem,
} from "@patternfly/react-core";

import { AdminPaths } from "@app/Paths";
import {
  Agent,
  ConfigurationCheck,
  MigrationPlan,
  ModelProjection,
  getStagesWithUnverifiedModel,
} from "@app/agentic";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { statusPresentation } from "@app/pages/agentic/components/agentic-status";

export interface PlanConfigurationAlertProps {
  plan: MigrationPlan;
  checks: ConfigurationCheck[];
  /** Loaded agents and models; the Models check is an issue only when both loaded. */
  agents: Agent[];
  models: ModelProjection[];
  /** Users who can open Models get "View models". */
  canViewModels: boolean;
  /** Passed with the plan write scope: "Edit migration plan" for a missing path or stages. */
  onEdit?: () => void;
}

interface Issue {
  id: string;
  title: string;
  body: React.ReactNode;
}

/**
 * The plan's one configuration alert (guide 7.3, plans P7): shown only when
 * a check is an issue. The title names the problem; for unverified models
 * the body lists each affected stage with its agent and model. Several
 * issues share one alert.
 */
export const PlanConfigurationAlert: React.FC<PlanConfigurationAlertProps> = ({
  plan,
  checks,
  agents,
  models,
  canViewModels,
  onEdit,
}) => {
  const { t } = useTranslation();
  const modelsLink = useLinkComponent(AdminPaths.models);
  const issueIds = checks
    .filter((check) => check.status === "issue")
    .map((check) => check.id);
  if (issueIds.length === 0) {
    return null;
  }

  const issues: Issue[] = [];
  if (issueIds.includes("path")) {
    issues.push({
      id: "path",
      title: t("agentic.plan.noPathTitle"),
      body: t("agentic.plan.noPathBody"),
    });
  }
  if (issueIds.includes("stages")) {
    issues.push({
      id: "stages",
      title: t("agentic.plan.noStagesTitle"),
      body: t("agentic.plan.noStagesBody"),
    });
  }
  if (issueIds.includes("models")) {
    const affected = getStagesWithUnverifiedModel(plan, agents, models);
    issues.push({
      id: "models",
      title: t("agentic.plan.configurationCheck.models.unavailable", {
        count: affected.length,
      }),
      body: (
        <Content>
          <Content component="p">
            {t("agentic.plan.affectedStagesIntro")}
          </Content>
          <Content component="ul">
            {affected.map(({ stage, agent, model }) => (
              <Content component="li" key={stage.id}>
                {t("agentic.plan.affectedStage", {
                  stage: stage.name,
                  agent: agent?.name ?? stage.agent.name,
                  model:
                    model?.name ??
                    agent?.model.name ??
                    t("agentic.common.unavailable"),
                  status:
                    model != null
                      ? t(
                          statusPresentation.verification[
                            model.verificationStatus
                          ].labelKey
                        )
                      : t("agentic.common.unavailable"),
                })}
              </Content>
            ))}
          </Content>
        </Content>
      ),
    });
  }

  const hasEdit =
    onEdit != null &&
    (issueIds.includes("path") || issueIds.includes("stages"));
  const hasViewModels = canViewModels && issueIds.includes("models");
  const actionLinks =
    hasEdit || hasViewModels ? (
      <>
        {hasEdit && (
          <AlertActionLink onClick={onEdit}>
            {t("agentic.plan.editPlan")}
          </AlertActionLink>
        )}
        {hasViewModels && (
          <AlertActionLink component={modelsLink}>
            {t("agentic.plan.viewModels")}
          </AlertActionLink>
        )}
      </>
    ) : undefined;

  const [only] = issues;
  return (
    <Alert
      variant="warning"
      isInline
      title={
        issues.length === 1
          ? only.title
          : t("agentic.plan.configurationIssues", { count: issues.length })
      }
      actionLinks={actionLinks}
    >
      {issues.length === 1 ? (
        only.body
      ) : (
        <Stack hasGutter>
          {issues.map((issue) => (
            <StackItem key={issue.id}>
              <Content component="p">
                <strong>{issue.title}</strong>
              </Content>
              {issue.body}
            </StackItem>
          ))}
        </Stack>
      )}
    </Alert>
  );
};
