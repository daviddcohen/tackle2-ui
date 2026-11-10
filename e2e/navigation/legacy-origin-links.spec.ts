/**
 * Shared URLs carry their origin as `?from=<type>-<id>` (and the older
 * `?fromAgent=<id>`). Opened cold (no history state), the detail page rebuilds
 * the trail from that parameter; in-app navigation carries the full trail in
 * history state instead (see entity-links.spec.ts and
 * docs/navigation-context-handoff.md).
 */
import {
  breadcrumb,
  breadcrumbTitles,
  expect,
  main,
  mainHeading,
  protoUrl,
  test,
} from "../support";

const state = { scenario: "completed" } as const;

const coldLinks: [path: string, crumbs: string[]][] = [
  [
    "/agents/1?from=plan-1",
    ["Migration Plans", "Java EE to Quarkus", "Migration Proposal Agent"],
  ],
  [
    "/migration-plans/1?from=agent-1",
    ["Agents", "Migration Proposal Agent", "Java EE to Quarkus"],
  ],
  [
    "/migration-plans/1?from=skill-3",
    ["Skills", "Jakarta EE namespace migration", "Java EE to Quarkus"],
  ],
  [
    "/skills/9?from=run-7",
    [
      "Plan Runs",
      "Run #7 — Legacy Java runtime modernization",
      "Java runtime modernization",
    ],
  ],
  [
    "/skills/3?from=collection-1",
    [
      "Skills",
      "Java modernization foundation",
      "Jakarta EE namespace migration",
    ],
  ],
  [
    "/applications/1?from=skill-5",
    ["Skills", "Corporate coding standards", "Customer Management"],
  ],
  [
    "/plan-runs/1?from=app-1",
    [
      "Application inventory",
      "Customer Management",
      "Run #1 — Java EE to Quarkus",
    ],
  ],
  [
    "/agents/2?from=run-1",
    ["Plan Runs", "Run #1 — Java EE to Quarkus", "Code Migrator"],
  ],
  ["/plan-runs/1/stages/2?fromAgent=2", ["Agents", "Code Migrator", "Migrate"]],
  // Without (or with an unusable) origin the canonical hierarchy is used.
  [
    "/plan-runs/1/stages/2",
    ["Plan Runs", "Run #1 — Java EE to Quarkus", "Migrate"],
  ],
  [
    "/migration-plans/1?from=bogus-1",
    ["Migration Plans", "Java EE to Quarkus"],
  ],
  ["/agents/1?from=plan-99999", ["Agents", "Migration Proposal Agent"]],
];

for (const [path, crumbs] of coldLinks) {
  test(`cold ${path} shows ${crumbs.slice(0, -1).join(" > ")}`, async ({
    page,
  }) => {
    await page.goto(protoUrl(path, state));
    await expect.poll(() => breadcrumbTitles(page)).toEqual(crumbs);
    // The origin crumb opens the origin entity.
    if (crumbs.length > 2) {
      await breadcrumb(page)
        .getByRole("link", { name: crumbs[crumbs.length - 2], exact: true })
        .click();
      await expect(mainHeading(page)).toContainText(crumbs[crumbs.length - 2]);
    }
  });
}

test("detail pages tag outgoing entity links with their own origin", async ({
  page,
}) => {
  const hrefs = async (selector: string) =>
    main(page)
      .locator(selector)
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  await page.goto(protoUrl("/agents/1", state));
  await expect(mainHeading(page)).toHaveText("Migration Proposal Agent");
  for (const href of await hrefs(
    'a[href^="/migration-plans/"], a[href^="/skills/"]'
  ))
    expect(href).toMatch(/[?&]from=agent-1(&|$)/);

  await page.goto(protoUrl("/plan-runs/1", state));
  await expect(mainHeading(page)).toHaveText("Run #1 — Java EE to Quarkus");
  const runLinks = await hrefs(
    'a[href^="/migration-plans/"], a[href^="/agents/"], a[href^="/skills/"]'
  );
  expect(runLinks.length).toBeGreaterThan(3);
  for (const href of runLinks) expect(href).toMatch(/[?&]from=run-1(&|$)/);
  // Stage runs are children of the run: no origin needed.
  for (const href of await hrefs('a[href*="/stages/"]'))
    expect(href).not.toContain("from=");
});
