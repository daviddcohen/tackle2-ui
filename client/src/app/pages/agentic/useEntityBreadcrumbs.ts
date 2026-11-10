import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { generatePath, useLocation } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  getAgentById,
  getMigrationPlanById,
  getPlanRunById,
  getSkillById,
  getSkillCollectionById,
} from "@app/api/rest/agentic";
import { getApplicationById } from "@app/api/rest/applications";
import {
  BreadcrumbEntry,
  useBreadcrumbs,
  useIncomingBreadcrumbs,
} from "@app/hooks/useBreadcrumbs";
import {
  AgenticQueryGroup,
  agenticKeys,
  agenticRetry,
  isUsableId,
} from "@app/queries/agentic";

// Compatibility for existing shared URLs. New navigation carries the complete trail in history state.
const originTypes = {
  agent: {
    path: DevPaths.agentDetails,
    param: "agentId",
    root: DevPaths.agents,
    title: "sidebar.agents",
    fetch: getAgentById,
    group: "agents",
  },
  plan: {
    path: DevPaths.migrationPlanDetails,
    param: "planId",
    root: DevPaths.migrationPlans,
    title: "sidebar.plans",
    fetch: getMigrationPlanById,
    group: "plans",
  },
  skill: {
    path: DevPaths.skillDetails,
    param: "skillId",
    root: DevPaths.skills,
    title: "agentic.skill.title",
    fetch: getSkillById,
    group: "skills",
  },
  collection: {
    path: DevPaths.skillCollectionDetails,
    param: "collectionId",
    root: DevPaths.skills,
    title: "agentic.skill.title",
    fetch: getSkillCollectionById,
    group: "skillCollections",
  },
  run: {
    path: DevPaths.planRunDetails,
    param: "runId",
    root: DevPaths.planRuns,
    title: "agentic.planRun.title",
    fetch: getPlanRunById,
    group: "planRuns",
  },
  app: {
    path: DevPaths.applicationDetails,
    param: "applicationId",
    root: DevPaths.applications,
    title: "sidebar.applicationInventory",
    fetch: getApplicationById,
    group: undefined,
  },
} satisfies Record<
  string,
  {
    path: string;
    param: string;
    root: string;
    title: string;
    fetch: (id: string) => Promise<{ name: string }>;
    group: AgenticQueryGroup | undefined;
  }
>;

const BREADCRUMB_APP_KEY = "breadcrumbOriginApplication";

/** Fetches the origin entity named by a breadcrumb query key. */
const fetchOriginName = (queryKey: readonly unknown[]) => {
  const id = String(queryKey[queryKey.length - 1]);
  if (queryKey[0] === BREADCRUMB_APP_KEY) return getApplicationById(id);
  const origin = Object.values(originTypes).find(
    (candidate) => candidate.group === queryKey[1]
  );
  return origin
    ? origin.fetch(id)
    : Promise.reject(new Error("Unknown breadcrumb origin"));
};

export const useEntityBreadcrumbs = (
  title: string,
  fallback: BreadcrumbEntry[]
) => {
  const { t } = useTranslation();
  const { search } = useLocation();
  const incoming = useIncomingBreadcrumbs();
  const params = new URLSearchParams(search);
  const from =
    params.get("from") ??
    (params.has("fromAgent") ? `agent-${params.get("fromAgent")}` : "");
  const match = /^(agent|plan|skill|collection|run|app)-(.+)$/.exec(from);
  const origin = match
    ? originTypes[match[1] as keyof typeof originTypes]
    : undefined;
  const id = match?.[2];
  // Same keys as the entity's detail hook, so the cache (and rename
  // invalidation) is shared with the rest of the query layer.
  const { data } = useQuery<{ name: string }>({
    queryKey:
      origin?.group != null
        ? agenticKeys.detail(origin.group, id ?? "")
        : [BREADCRUMB_APP_KEY, id ?? ""],
    queryFn: ({ queryKey }) => fetchOriginName(queryKey),
    enabled: incoming === undefined && origin != null && isUsableId(id),
    retry: agenticRetry,
  });
  return useBreadcrumbs(
    title,
    origin && data && id != null
      ? [
          { title: t(origin.title), path: origin.root },
          {
            title: data.name,
            path: generatePath<string>(origin.path, {
              [origin.param]: String(id),
            }),
          },
        ]
      : fallback
  );
};
