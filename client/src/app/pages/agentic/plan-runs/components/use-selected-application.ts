import * as React from "react";
import { useHistory, useLocation } from "react-router-dom";

import { HubRef, StageAgentRun, defaultStageAgentRun } from "@app/agentic";

/** The URL parameter holding the selected application. */
export const APPLICATION_PARAM = "application";

/** `?application=` as an application id, or undefined. */
const requestedApplicationOf = (search: string) => {
  const value = new URLSearchParams(search).get(APPLICATION_PARAM);
  return value != null && /^\d+$/.test(value) ? Number(value) : undefined;
};

/**
 * Which application's agent run the stage page shows.
 * A run on one application shows that application's. In a run on
 * several, the `?application=` parameter decides; when it is absent or
 * names no application of the run, the default (`defaultStageAgentRun`:
 * Action required, then Failed, then the run's order) is taken once the
 * agent runs have loaded (or could not be read) and written to the URL with
 * `replace`, keeping the other parameters and the trail. From then on only
 * the user or a link changes it: a later status change never moves it.
 */
export const useSelectedApplication = ({
  applications,
  stageAgentRuns,
  isReady,
}: {
  applications: HubRef[];
  stageAgentRuns: StageAgentRun[];
  /** The agent runs have loaded or failed, and the stage is known. */
  isReady: boolean;
}) => {
  const history = useHistory();
  const location = useLocation();
  const isSeveral = applications.length > 1;
  const requested = requestedApplicationOf(location.search);
  const isKnown =
    requested != null &&
    applications.some((application) => application.id === requested);
  const defaultId = React.useMemo(() => {
    if (!isSeveral || isKnown || !isReady) return undefined;
    const fromAgentRuns = defaultStageAgentRun(stageAgentRuns, applications)
      ?.application?.id;
    return fromAgentRuns != null &&
      applications.some((application) => application.id === fromAgentRuns)
      ? fromAgentRuns
      : applications[0].id;
  }, [isSeveral, isKnown, isReady, stageAgentRuns, applications]);

  React.useEffect(() => {
    if (defaultId == null) return;
    const search = new URLSearchParams(location.search);
    search.set(APPLICATION_PARAM, String(defaultId));
    history.replace({ ...location, search: `?${search}` });
  }, [defaultId, history, location]);

  const selectedId = !isSeveral
    ? applications[0]?.id
    : isKnown
      ? requested
      : defaultId;
  const select = (applicationId: number) => {
    const search = new URLSearchParams(location.search);
    search.set(APPLICATION_PARAM, String(applicationId));
    history.replace({ ...location, search: `?${search}` });
  };
  return { isSeveral, selectedId, select };
};
