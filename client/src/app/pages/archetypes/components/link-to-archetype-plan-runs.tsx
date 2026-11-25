import * as React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import type { Archetype } from "@app/api/models";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { CountLink } from "@app/pages/agentic/components/count-link";
import { archetypePlanRunsLocation } from "@app/pages/agentic/plan-runs/plan-runs-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchPlanRuns } from "@app/queries/agentic";
import { runTouchesArchetype } from "@app/utils/agentic";

/**
 * The plan runs that include an application of the archetype, as a count
 * linking to the plan runs list filtered by the archetype: the same rule as
 * that filter, so the count and the list agree.
 */
const LinkToArchetypePlanRuns: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const { linkCrumbs } = useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const { planRuns, isLoading, fetchError } = useFetchPlanRuns();

  if (isLoading) {
    return <Skeleton width="6rem" screenreaderText={t("terms.loading")} />;
  }
  if (fetchError != null) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  const count = planRuns.filter((run) =>
    runTouchesArchetype(run, archetype)
  ).length;
  return count === 0 ? (
    <EmptyTextMessage message={t("terms.none")} />
  ) : (
    <CountLink to={archetypePlanRunsLocation(archetype.id, linkCrumbs)}>
      {t("agentic.archetype.planRunCount", { count })}
    </CountLink>
  );
};

export default LinkToArchetypePlanRuns;
