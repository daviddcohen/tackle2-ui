import * as React from "react";
import { useTranslation } from "react-i18next";
import { Content } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { secondsSince } from "./agent-run-logs-helpers";

/**
 * "Updated n seconds ago." (from a minute on, "Updated n minutes ago.")
 * for a view that refreshes while its stage is live: the one wording every
 * stage view uses. Its own component, so the
 * one second tick re-renders only this text. Keep it outside live regions:
 * a ticking announcement is noise.
 */
export const UpdatedAgo: React.FC<{ updatedAt: number }> = ({ updatedAt }) => {
  const { t } = useTranslation();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [updatedAt]);
  const seconds = secondsSince(updatedAt, now);
  return (
    <>
      {seconds === 0
        ? t("agentic.agentRun.updatedJustNow")
        : seconds < 60
          ? t("agentic.agentRun.updatedSecondsAgo", { count: seconds })
          : t("agentic.agentRun.updatedMinutesAgo", {
              count: Math.floor(seconds / 60),
            })}
    </>
  );
};

/**
 * A view's live status as one subtle sentence: what keeps it current
 * ("Refreshes while the agent runs."), then "Updated n seconds ago." once
 * it has read something. The logs build their own, with the pod and the
 * follow state, in the same shape.
 */
export const LiveSentence: React.FC<{
  children: React.ReactNode;
  updatedAt?: number;
}> = ({ children, updatedAt }) => (
  <Content component="small" className={textStyles.textColorSubtle}>
    {children}
    {updatedAt != null && (
      <>
        {" "}
        <UpdatedAgo updatedAt={updatedAt} />
      </>
    )}
  </Content>
);
