/**
 * Exhaustive link sweep: on every list and detail view of the fixture graph,
 * every rendered entity link must
 *  - open the entity it names (current crumb === link text),
 *  - extend the source view's trail by exactly one crumb, and
 *  - return to the exact source view (URL and trail) from the parent crumb.
 *
 * One test per entity group so failures point at a surface and the groups run
 * in parallel. This is the slowest spec of the suite (about a minute per
 * group); it replaces many hand-written "link X goes to Y" checks.
 */
import type { Page } from "@playwright/test";

import {
  type FixtureGraph,
  type Named,
  breadcrumb,
  breadcrumbTitles,
  currentCrumb,
  expect,
  fixtureGraph,
  mainHeading,
  protoUrl,
  test,
} from "../support";

const state = { scenario: "completed", stage: 4 } as const;

const ready = async (page: Page) => {
  await expect(mainHeading(page)).toBeVisible();
  await expect(page.locator("#react-refresh-overlay")).toHaveCount(0);
};

const internalEntity =
  /^\/(agents|migration-plans|plan-runs|skills|applications|archetypes)(?:\/(?:\d+|collections)(?:\/\d+|\/stages\/\d+|\/target-profiles)?)*(?:[?#]|$)/;

const GROUPS = [
  "lists",
  "skills",
  "collections",
  "agents",
  "plans",
  "runs",
  "applications",
  "archetypes",
] as const;
type Group = (typeof GROUPS)[number];

const surfaces = (graph: FixtureGraph, group: Group): string[] => {
  switch (group) {
    case "lists":
      return [
        "/applications?itemsPerPage=100&pageNumber=1",
        "/agents",
        "/migration-plans",
        "/plan-runs",
        "/skills?skills:itemsPerPage=100&skills:pageNumber=1",
      ];
    case "skills":
      return graph.skills.flatMap((skill) => [
        `/skills/${skill.id}`,
        `/skills/${skill.id}?tab=associations`,
      ]);
    case "collections":
      return graph.collections.map(
        (collection) => `/skills/collections/${collection.id}`
      );
    case "agents":
      return graph.agents.flatMap((agent) => [
        `/agents/${agent.id}`,
        `/agents/${agent.id}?tab=runs`,
      ]);
    case "plans":
      return graph.plans.flatMap((plan) => [
        `/migration-plans/${plan.id}`,
        `/migration-plans/${plan.id}?tab=runs`,
      ]);
    case "runs":
      return graph.runs.flatMap((run) => [
        `/plan-runs/${run.id}`,
        ...run.stageRuns.map(
          (stage) => `/plan-runs/${run.id}/stages/${stage.stageId}`
        ),
      ]);
    case "applications":
      return graph.applications.flatMap((application) => [
        `/applications/${application.id}`,
        `/applications/${application.id}?tab=skills`,
        `/applications/${application.id}?tab=plan-runs`,
      ]);
    case "archetypes":
      return graph.archetypes.flatMap((archetype) => [
        ...[0, 1, 2].map(
          (tab) => `/archetypes?ar:activeItem=${archetype.id}&ar:tab=${tab}`
        ),
        `/archetypes/${archetype.id}/target-profiles`,
        ...(archetype.profiles ?? []).map(
          (profile) =>
            `/archetypes/${archetype.id}/target-profiles#target-profile-${profile.id}`
        ),
      ]);
  }
};

/** Name of the entity an href points at, when it identifies one. */
const expectedName = (graph: FixtureGraph, href: string) => {
  const url = new URL(href, "http://e2e.invalid");
  const path = url.pathname;
  if (path === "/archetypes" && url.searchParams.has("ar:activeItem"))
    return graph.archetypes.find(
      (archetype) => `${archetype.id}` === url.searchParams.get("ar:activeItem")
    )?.name;
  if (/\/target-profiles$/.test(path) && url.hash)
    return graph.archetypes
      .flatMap((archetype) => archetype.profiles ?? [])
      .find((profile) => `#target-profile-${profile.id}` === url.hash)?.name;
  const stage = /\/plan-runs\/(\d+)\/stages\/(\d+)$/.exec(path);
  if (stage != null) {
    const run = graph.runs.find((candidate) => `${candidate.id}` === stage[1]);
    return graph.plans
      .find((plan) => plan.id === run?.planId)
      ?.stages.find((candidate) => `${candidate.id}` === stage[2])?.name;
  }
  const routes: [string, Named[]][] = [
    ["/agents", graph.agents],
    ["/migration-plans", graph.plans],
    ["/plan-runs", graph.runs],
    ["/skills/collections", graph.collections],
    ["/skills", graph.skills],
    ["/applications", graph.applications],
  ];
  for (const [prefix, entities] of routes)
    if (new RegExp(`^${prefix}/\\d+$`).test(path))
      return entities.find((entity) => `${entity.id}` === path.split("/").pop())
        ?.name;
  return undefined;
};

for (const group of GROUPS) {
  test(`every ${group} entity link opens the named entity and keeps its source trail`, async ({
    page,
    pageErrors,
  }, testInfo) => {
    test.setTimeout(300_000);
    await page.goto(protoUrl("/plan-runs", state));
    await ready(page);
    const graph = await fixtureGraph(page);
    const sources = surfaces(graph, group);
    let checked = 0;
    for (const source of sources) {
      await page.goto(protoUrl(source, state));
      await ready(page);
      // Entity tables come from in-page mocks; let every query settle.
      await page.waitForLoadState("networkidle");
      const sourceURL = page.url();
      const sourceTitles = await breadcrumbTitles(page);
      const sourceTitle =
        sourceTitles.at(-1) ?? (await mainHeading(page).innerText()).trim();
      const links = await page
        .locator("main a[href], #page-drawer-content a[href]")
        .evaluateAll((elements) => [
          ...new Map(
            elements
              .filter(
                (element) =>
                  !element.closest('[aria-label="Breadcrumb"]') &&
                  element.getClientRects().length > 0
              )
              .map((element) => [
                element.getAttribute("href"),
                {
                  href: element.getAttribute("href") ?? "",
                  label: element.textContent?.trim() ?? "",
                },
              ])
          ).values(),
        ]);
      for (const { href, label } of links.filter((link) =>
        internalEntity.test(link.href)
      )) {
        await test.step(`${source} -> ${href}`, async () => {
          // Match the exact href: entity names can repeat in several tables.
          await page
            .locator(
              `main a[href=${JSON.stringify(href)}], #page-drawer-content a[href=${JSON.stringify(href)}]`
            )
            .filter({ visible: true })
            .first()
            .click();
          const destination = new URL(href, sourceURL);
          await expect(page).toHaveURL(
            (url) =>
              url.pathname === destination.pathname &&
              url.hash === destination.hash
          );
          await ready(page);
          await expect(breadcrumb(page)).toBeVisible();
          const expected = expectedName(graph, href);
          if (expected != null) {
            await expect(currentCrumb(page)).toHaveText(expected);
            if (!/\/stages\//.test(href))
              expect(label, `mislabelled reference ${source} -> ${href}`).toBe(
                expected
              );
          }
          expect(
            (await breadcrumbTitles(page)).slice(0, -1),
            `${source} -> ${href}: source context lost`
          ).toEqual(sourceTitles.length ? sourceTitles : [sourceTitle]);
          await breadcrumb(page)
            .getByRole("link", { name: sourceTitle, exact: true })
            .last()
            .click();
          await expect(page).toHaveURL(sourceURL);
          await ready(page);
          expect(await breadcrumbTitles(page)).toEqual(sourceTitles);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
    await testInfo.attach(`${group}-coverage`, {
      body: JSON.stringify({ group, sources, checked }),
      contentType: "application/json",
    });
  });
}
