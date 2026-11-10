import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  Flex,
  FlexItem,
  Label,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import {
  CodeBranchIcon,
  GithubIcon,
  GitlabIcon,
} from "@patternfly/react-icons";

import {
  ApplicationMigrationCommit,
  ControllerRunPhase,
  StageMessage,
} from "@app/agentic";

interface StageRunContentProps {
  status: ControllerRunPhase;
  messages: StageMessage[];
  commits: ApplicationMigrationCommit[];
}

const vcsIcon = (url?: string) => {
  if (url?.includes("github.com")) return <GithubIcon />;
  if (url?.includes("gitlab")) return <GitlabIcon />;
  return <CodeBranchIcon />;
};

export const StageRunContent: React.FC<StageRunContentProps> = ({
  status,
  messages,
  commits,
}) => {
  const { t } = useTranslation();

  const activitiesEmpty =
    status === "Running"
      ? t("agentic.planRun.activitiesRunning")
      : t("agentic.planRun.activitiesEmpty");

  return (
    <Stack hasGutter>
      {/* Activities */}
      <StackItem>
        <Content
          component="h4"
          style={{ marginBottom: "var(--pf-t--global--spacer--sm)" }}
        >
          {t("agentic.planRun.activities")}
        </Content>
        {messages.length === 0 ? (
          <Content
            component="small"
            style={{ color: "var(--pf-t--global--text--color--subtle)" }}
          >
            {activitiesEmpty}
          </Content>
        ) : (
          <Stack>
            {messages.map((message, i) => (
              <StackItem
                key={i}
                style={{ paddingBlock: "var(--pf-t--global--spacer--xs)" }}
              >
                <Content
                  component="small"
                  style={{ color: "var(--pf-t--global--text--color--subtle)" }}
                >
                  {new Date(message.timestamp).toLocaleString()}
                </Content>
                <Content component="p" style={{ margin: 0 }}>
                  {message.content}
                </Content>
              </StackItem>
            ))}
          </Stack>
        )}
      </StackItem>

      {/* Commits */}
      <StackItem>
        <Content
          component="h4"
          style={{ marginBottom: "var(--pf-t--global--spacer--sm)" }}
        >
          {t("agentic.planRun.commits")}
        </Content>
        {commits.length === 0 ? (
          <Content
            component="small"
            style={{ color: "var(--pf-t--global--text--color--subtle)" }}
          >
            {t("agentic.planRun.commitsEmpty")}
          </Content>
        ) : (
          <Stack hasGutter>
            {commits.map((commit) => (
              <StackItem key={commit.hash}>
                <Flex
                  alignItems={{ default: "alignItemsCenter" }}
                  gap={{ default: "gapSm" }}
                >
                  <FlexItem>
                    {commit.url ? (
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Label
                          isCompact
                          icon={vcsIcon(commit.url)}
                          color="blue"
                          variant="outline"
                        >
                          {commit.hash.slice(0, 8)}
                        </Label>
                      </a>
                    ) : (
                      <Label
                        isCompact
                        icon={<CodeBranchIcon />}
                        color="blue"
                        variant="outline"
                      >
                        {commit.hash.slice(0, 8)}
                      </Label>
                    )}
                  </FlexItem>
                  <FlexItem grow={{ default: "grow" }}>
                    <Content component="small">{commit.message}</Content>
                  </FlexItem>
                </Flex>
              </StackItem>
            ))}
          </Stack>
        )}
      </StackItem>
    </Stack>
  );
};
