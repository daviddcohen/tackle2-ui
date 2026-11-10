jest.unmock("react-router-dom");

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { LocationDescriptorObject, createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import {
  getAgentById,
  getMigrationPlanById,
  getPlanRunById,
  getSkillById,
  getSkillCollectionById,
} from "@app/api/rest/agentic";
import { getApplicationById } from "@app/api/rest/applications";

import { useEntityBreadcrumbs } from "./useEntityBreadcrumbs";

jest.mock("@app/api/rest/agentic", () => ({
  ...jest.requireActual("@app/api/rest/agentic"),
  getAgentById: jest.fn(),
  getMigrationPlanById: jest.fn(),
  getPlanRunById: jest.fn(),
  getSkillById: jest.fn(),
  getSkillCollectionById: jest.fn(),
}));
jest.mock("@app/api/rest/applications", () => ({
  ...jest.requireActual("@app/api/rest/applications"),
  getApplicationById: jest.fn(),
}));

const fetchers = {
  agent: jest.mocked(getAgentById),
  plan: jest.mocked(getMigrationPlanById),
  run: jest.mocked(getPlanRunById),
  skill: jest.mocked(getSkillById),
  collection: jest.mocked(getSkillCollectionById),
  app: jest.mocked(getApplicationById),
};

const fallback = [{ title: "Skills", path: "/skills" }];

const renderAt = (location: LocationDescriptorObject) => {
  const history = createMemoryHistory({ initialEntries: [location] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Router history={history}>{children}</Router>
    </QueryClientProvider>
  );
  return renderHook(() => useEntityBreadcrumbs("Current", fallback), {
    wrapper,
  });
};

beforeEach(() => {
  Object.values(fetchers).forEach((fetcher) => fetcher.mockReset());
});

describe("useEntityBreadcrumbs", () => {
  it("uses the fallback trail without an origin and fetches nothing", () => {
    const { result } = renderAt({ pathname: "/skills/3" });
    expect(result.current.breadcrumbs).toEqual([
      ...fallback,
      { title: "Current" },
    ]);
    Object.values(fetchers).forEach((fetcher) =>
      expect(fetcher).not.toHaveBeenCalled()
    );
  });

  it.each([
    ["agent-1", "agent", "sidebar.agents", "/agents", "/agents/1"],
    [
      "plan-2",
      "plan",
      "sidebar.plans",
      "/migration-plans",
      "/migration-plans/2",
    ],
    ["skill-3", "skill", "agentic.skill.title", "/skills", "/skills/3"],
    [
      "collection-4",
      "collection",
      "agentic.skill.title",
      "/skills",
      "/skills/collections/4",
    ],
    ["run-5", "run", "agentic.planRun.title", "/plan-runs", "/plan-runs/5"],
    [
      "app-6",
      "app",
      "sidebar.applicationInventory",
      "/applications",
      "/applications/6",
    ],
  ] as const)(
    "?from=%s resolves the %s origin into a two-level trail",
    async (from, type, rootTitle, rootPath, entityPath) => {
      fetchers[type].mockResolvedValue({ name: "Origin entity" } as never);
      const { result } = renderAt({
        pathname: "/agents/9",
        search: `?from=${from}`,
      });
      // The fallback is shown until the origin's name is known.
      expect(result.current.breadcrumbs).toEqual([
        ...fallback,
        { title: "Current" },
      ]);
      await waitFor(() =>
        expect(result.current.breadcrumbs).toEqual([
          { title: rootTitle, path: rootPath },
          { title: "Origin entity", path: entityPath },
          { title: "Current" },
        ])
      );
      expect(fetchers[type]).toHaveBeenCalledWith(from.split("-")[1]);
    }
  );

  it("supports the legacy ?fromAgent=<id> parameter", async () => {
    fetchers.agent.mockResolvedValue({ name: "Code Migrator" } as never);
    const { result } = renderAt({
      pathname: "/plan-runs/1/stages/2",
      search: "?fromAgent=2",
    });
    await waitFor(() =>
      expect(result.current.breadcrumbs.map((crumb) => crumb.title)).toEqual([
        "sidebar.agents",
        "Code Migrator",
        "Current",
      ])
    );
    expect(fetchers.agent).toHaveBeenCalledWith("2");
  });

  it.each(["bogus-1", "agent-", "agent-NaN", "agent"])(
    "ignores an unusable origin %s",
    (from) => {
      const { result } = renderAt({
        pathname: "/skills/3",
        search: `?from=${from}`,
      });
      expect(result.current.breadcrumbs).toEqual([
        ...fallback,
        { title: "Current" },
      ]);
      expect(fetchers.agent).not.toHaveBeenCalled();
    }
  );

  it("keeps the fallback when the origin entity cannot be loaded", async () => {
    fetchers.plan.mockRejectedValue(new Error("404"));
    const { result } = renderAt({
      pathname: "/agents/1",
      search: "?from=plan-99999",
    });
    await waitFor(() => expect(fetchers.plan).toHaveBeenCalled());
    expect(result.current.breadcrumbs).toEqual([
      ...fallback,
      { title: "Current" },
    ]);
  });

  it("prefers the trail carried in history state over the origin parameter", () => {
    const incoming = [
      { title: "Application inventory", path: "/applications" },
      { title: "Customer Management", path: "/applications/1?tab=skills" },
    ];
    const { result } = renderAt({
      pathname: "/skills/3",
      search: "?from=agent-1",
      state: { breadcrumbs: incoming },
    });
    expect(result.current.breadcrumbs).toEqual([
      ...incoming,
      { title: "Current" },
    ]);
    expect(fetchers.agent).not.toHaveBeenCalled();
  });
});
