import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  CodeBlock,
  CodeBlockCode,
  EmptyState,
  EmptyStateBody,
  ExpandableSection,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { StageRun } from "@app/agentic";
import { ExternalLink } from "@app/components/ExternalLink";
import { formatTableDate } from "@app/utils/utils";

import { RunPageSection } from "./run-page-layout";

/**
 * The agent is done with a stage once it succeeded, failed or waits for
 * approval: an empty set then means "none", not "none yet".
 */
const isFinished = (stageRun: StageRun) =>
  stageRun.status === "Succeeded" ||
  stageRun.status === "Failed" ||
  stageRun.status === "AwaitingApproval";

const SectionEmpty: React.FC<{ children: string }> = ({ children }) => (
  <EmptyState variant="xs">
    <EmptyStateBody>{children}</EmptyStateBody>
  </EmptyState>
);

/**
 * "Activity" (guide 4.3): the stage's messages as Time · From · Message,
 * then its raw output behind "Show output". An agent message is from the
 * stage's agent, which the Agent fact above already links.
 */
export const StageActivity: React.FC<{ stageRun: StageRun }> = ({
  stageRun,
}) => {
  const { t } = useTranslation();
  const messages = stageRun.messages ?? [];
  const columns = {
    time: t("agentic.stageRun.time"),
    from: t("agentic.stageRun.from"),
    message: t("terms.message"),
  };
  return (
    <RunPageSection title={t("agentic.stageRun.activity")}>
      {messages.length > 0 ? (
        <Table aria-label={t("agentic.stageRun.activity")} variant="compact">
          <Thead>
            <Tr>
              <Th modifier="fitContent">{columns.time}</Th>
              <Th modifier="fitContent">{columns.from}</Th>
              <Th>{columns.message}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {messages.map((message, index) => (
              <Tr key={`${index}-${message.timestamp}`}>
                <Td dataLabel={columns.time} modifier="nowrap">
                  {formatTableDate(new Date(message.timestamp))}
                </Td>
                <Td dataLabel={columns.from} modifier="nowrap">
                  {message.role === "agent"
                    ? stageRun.agent.name
                    : t("terms.user")}
                </Td>
                <Td dataLabel={columns.message}>{message.content}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : (
        <SectionEmpty>
          {isFinished(stageRun)
            ? t("agentic.stageRun.activityEmptyFinished")
            : t("agentic.stageRun.activityEmpty")}
        </SectionEmpty>
      )}
      {stageRun.output && (
        <ExpandableSection
          toggleTextCollapsed={t("agentic.stageRun.showOutput")}
          toggleTextExpanded={t("agentic.stageRun.hideOutput")}
        >
          <CodeBlock>
            <CodeBlockCode>{stageRun.output}</CodeBlockCode>
          </CodeBlock>
        </ExpandableSection>
      )}
    </RunPageSection>
  );
};

/**
 * "Commits" with a count when it has rows (plan-runs amendment 5): the
 * hash, monospace and an external link when the commit has a URL, and its
 * message.
 */
export const StageCommits: React.FC<{ stageRun: StageRun }> = ({
  stageRun,
}) => {
  const { t } = useTranslation();
  const commits = stageRun.commits ?? [];
  const columns = {
    commit: t("agentic.stageRun.commit"),
    message: t("terms.message"),
  };
  return (
    <RunPageSection
      title={
        commits.length > 0
          ? t("agentic.stageRun.commitsTitle", { count: commits.length })
          : t("agentic.planRun.commits")
      }
    >
      {commits.length > 0 ? (
        <Table aria-label={t("agentic.planRun.commits")} variant="compact">
          <Thead>
            <Tr>
              <Th modifier="fitContent">{columns.commit}</Th>
              <Th>{columns.message}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {commits.map((commit) => {
              const hash = (
                <span className={textStyles.fontFamilyMonospace}>
                  {commit.hash}
                </span>
              );
              return (
                <Tr key={commit.hash}>
                  <Td dataLabel={columns.commit} modifier="nowrap">
                    {commit.url ? (
                      <ExternalLink href={commit.url} isInline>
                        {hash}
                      </ExternalLink>
                    ) : (
                      hash
                    )}
                  </Td>
                  <Td dataLabel={columns.message}>{commit.message}</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      ) : (
        <SectionEmpty>
          {isFinished(stageRun)
            ? t("agentic.stageRun.commitsEmptyFinished")
            : t("agentic.stageRun.commitsEmpty")}
        </SectionEmpty>
      )}
    </RunPageSection>
  );
};
