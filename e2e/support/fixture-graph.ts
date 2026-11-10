/**
 * The mock fixture graph (agentic entities plus the Hub applications and
 * archetypes they reference), read through the mock API. Call it on any
 * loaded app page: the MSW worker only answers requests made by the page.
 */
import type { Page } from "@playwright/test";

export interface Named {
  id: string | number;
  name: string;
}
export interface FixtureGraph {
  skills: (Named & {
    associations?: { scope: string; resource: { id: number } }[];
  })[];
  collections: Named[];
  agents: (Named & { skills: Named[] })[];
  plans: (Named & { stages: Named[] })[];
  runs: (Named & {
    planId: string;
    applications: Named[];
    stageRuns: { stageId: string }[];
  })[];
  applications: Named[];
  archetypes: (Named & { profiles?: Named[] })[];
}

/** Reads the whole fixture graph from the mock API. */
export const fixtureGraph = (page: Page): Promise<FixtureGraph> =>
  page.evaluate(async () => {
    const fetchData = async (path: string) => {
      const response = await fetch(`/hub/${path}`);
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    };
    const [skills, collections, agents, plans, runs, applications, archetypes] =
      await Promise.all(
        [
          "prototype/agentic/skills",
          "prototype/agentic/skill-collections",
          "prototype/agentic/agents",
          "prototype/agentic/plans",
          "prototype/agentic/plan-runs",
          "applications",
          "archetypes",
        ].map(fetchData)
      );
    const appIds = new Set<number>([
      ...applications.map((application: { id: number }) => application.id),
      ...skills.flatMap(
        (skill: {
          associations?: { scope: string; resource: { id: number } }[];
        }) =>
          (skill.associations ?? [])
            .filter((association) => association.scope === "application")
            .map((association) => association.resource.id)
      ),
      ...runs.flatMap((run: { applications: { id: number }[] }) =>
        run.applications.map((application) => application.id)
      ),
    ]);
    const allApplications = await Promise.all(
      [...appIds].map((id) => fetchData(`applications/${id}`))
    );
    return {
      skills,
      collections,
      agents,
      plans,
      runs,
      applications: allApplications,
      archetypes,
    };
  });
