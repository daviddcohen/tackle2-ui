import * as React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { ControllerRunPhase, StageRun, isCommitOf } from "@app/agentic";
import { ExternalLink } from "@app/components/ExternalLink";

import { DetailSection, SectionEmpty } from "../../components/detail-section";

/**
 * The agent is done with a stage once it succeeded, failed or waits for
 * approval: an empty set then means "none", not "none yet".
 */
/** Names the section, a region like Skills, by its heading. */
const COMMITS_HEADING_ID = "stage-run-commits-heading";

const isFinished = (phase: ControllerRunPhase) =>
  phase === "Succeeded" || phase === "Failed" || phase === "AwaitingApproval";

/**
 * "Commits" with a count when it has rows: the
 * hash, monospace and an external link when the commit has a URL, and its
 * message. In a run on several applications, only the selected
 * application's commits (`applicationId`), and "none" follows that
 * application's agent run (`phase`).
 */
export const StageCommits: React.FC<{
  stageRun: StageRun;
  /** The application whose commits show; absent: every commit. */
  applicationId?: number;
  /** The phase that says whether the agent is done; default the stage's. */
  phase?: ControllerRunPhase;
  /** The application is not chosen yet. */
  isLoading?: boolean;
}> = ({ stageRun, applicationId, phase = stageRun.status, isLoading }) => {
  const { t } = useTranslation();
  const commits = (stageRun.commits ?? []).filter((commit) =>
    isCommitOf(commit, applicationId)
  );
  if (isLoading) {
    return (
      <DetailSection
        title={t("agentic.planRun.commits")}
        headingId={COMMITS_HEADING_ID}
      >
        <Skeleton
          height="1.5rem"
          screenreaderText={t("agentic.stageRun.loadingValue")}
        />
      </DetailSection>
    );
  }
  const columns = {
    commit: t("agentic.stageRun.commit"),
    message: t("terms.message"),
  };
  return (
    <DetailSection
      headingId={COMMITS_HEADING_ID}
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
          {isFinished(phase)
            ? t("agentic.stageRun.commitsEmptyFinished")
            : t("agentic.stageRun.commitsEmpty")}
        </SectionEmpty>
      )}
    </DetailSection>
  );
};
