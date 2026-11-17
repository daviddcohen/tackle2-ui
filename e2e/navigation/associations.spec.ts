/**
 * Cross-entity sections render the related entities as links. Where each link
 * leads (and the trail it keeps) is covered exhaustively by entity-links.spec.ts.
 */
import {
  expect,
  main,
  mainHeading,
  protoUrl,
  test,
  withBase,
} from "../support";

test("skill associations list direct associations, plans and collections", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills/3?tab=associations"));
  await expect(mainHeading(page)).toHaveText("Jakarta EE namespace migration");
  for (const section of [
    /^Associated with \(\d+\)$/,
    /^Used in migration plans \(\d+\)$/,
    /^In skill collections \(\d+\)$/,
  ])
    await expect(
      main(page).getByRole("heading", { level: 2, name: section })
    ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Java EE Application" }).first()
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Java EE to Quarkus" }).first()
  ).toBeVisible();
});

test("an application associated with a skill links to the application", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills/5?tab=associations"));
  await expect(
    main(page).getByRole("link", { name: "Customer Management" }).first()
  ).toHaveAttribute("href", new RegExp(`^${withBase("/applications/1")}\\b`));
});

test("plan detail links its stage agents and skills and shows where each skill comes from", async ({
  page,
}) => {
  await page.goto(protoUrl("/migration-plans/1"));
  await expect(mainHeading(page)).toHaveText("Java EE to Quarkus");
  await expect(
    main(page).getByRole("heading", { name: /^Skills \(\d+\)$/ })
  ).toBeVisible();
  const skills = page.getByRole("grid", { name: "Skills", exact: true });
  await expect(
    skills.getByRole("columnheader", { name: "Source" })
  ).toBeVisible();
  // One row per skill; every source is a plain-text line in that row.
  const jakarta = skills.getByRole("row", {
    name: /Jakarta EE namespace migration/,
  });
  await expect(jakarta).toHaveCount(1);
  await expect(jakarta).toContainText("Archetype: Java EE Application");
  await expect(jakarta).toContainText("Target profile: Quarkus 3.x");
  await expect(jakarta.getByRole("link")).toHaveCount(1);
  for (const name of [
    "Migration Proposal Agent",
    "API compatibility checklist",
    "Jakarta EE namespace migration",
    "Java EE Application",
  ])
    await expect(main(page).getByRole("link", { name }).first()).toBeVisible();
});

test("agent detail lists the plans that use it", async ({ page }) => {
  await page.goto(protoUrl("/agents/1"));
  await expect(mainHeading(page)).toHaveText("Migration Proposal Agent");
  await expect(main(page).getByText("Used in migration plans")).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Java EE to Quarkus" })
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "API compatibility checklist" })
  ).toBeVisible();
});

test("application skills tab lists every skill the agents use with its sources", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications/1?tab=skills"));
  const skills = page.getByRole("grid", { name: "Skills", exact: true });
  await expect(
    skills.getByRole("row", { name: /Corporate coding standards/ })
  ).toContainText("Application: Customer Management");
  const ejb = skills.getByRole("row", {
    name: /EJB to CDI conversion patterns/,
  });
  await expect(ejb).toContainText(/Agent: .+ via /);
  await expect(ejb).toContainText("Archetype: Java EE Application");
  await expect(ejb.getByRole("link")).toHaveCount(1);
});

test("plan run detail lists its skills below the stages", async ({ page }) => {
  await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
  const stages = page.getByRole("heading", { name: "Stages" });
  const resolved = page.getByRole("heading", { name: /^Skills \(\d+\)$/ });
  await expect(stages).toBeVisible();
  await expect(resolved).toBeVisible();
  const [stagesBox, resolvedBox] = await Promise.all([
    stages.boundingBox(),
    resolved.boundingBox(),
  ]);
  expect(resolvedBox!.y).toBeGreaterThan(stagesBox!.y);
  await expect(
    page
      .getByRole("grid", { name: "Skills", exact: true })
      .getByRole("link", { name: "Jakarta EE namespace migration" })
  ).toBeVisible();
});
