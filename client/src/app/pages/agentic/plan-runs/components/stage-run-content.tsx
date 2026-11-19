import * as React from "react";
import { useTranslation } from "react-i18next";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { StageRun } from "@app/agentic";
import { ExternalLink } from "@app/components/ExternalLink";

import { DetailSection, SectionEmpty } from "../../components/detail-section";

/**
 * The agent is done with a stage once it succeeded, failed or waits for
 * approval: an empty set then means "none", not "none yet".
 */
const isFinished = (stageRun: StageRun) =>
  stageRun.status === "Succeeded" ||
  stageRun.status === "Failed" ||
  stageRun.status === "AwaitingApproval";

/**
 * "Commits" with a count when it has rows: the
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
    <DetailSection
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
    </DetailSection>
  );
};
