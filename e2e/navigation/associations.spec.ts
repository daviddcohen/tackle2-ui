/**
 * Cross-entity sections render the related entities as links. Where each link
 * leads (and the trail it keeps) is covered exhaustively by entity-links.spec.ts.
 */
import { expect, main, mainHeading, protoUrl, test } from "../support";

test("skill associations list direct associations, plans and collections", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills/3?tab=associations"));
  await expect(mainHeading(page)).toHaveText("Jakarta EE namespace migration");
  for (const section of [
    "Directly associated with",
    "Active in migration plans",
    "In skill collections",
  ])
    await expect(main(page).getByText(section)).toBeVisible();
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
  ).toHaveAttribute("href", /^\/applications\/1\b/);
});

test("plan detail links its stage agents and skills and shows where each skill resolves from", async ({
  page,
}) => {
  await page.goto(protoUrl("/migration-plans/1"));
  await expect(mainHeading(page)).toHaveText("Java EE to Quarkus");
  await expect(main(page).getByText("Resolved skills").first()).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Resolved from" })
  ).toBeVisible();
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

test("application skills tab separates direct and archetype skills", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications/1?tab=skills"));
  await expect(main(page).getByText("Directly associated")).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Corporate coding standards" })
  ).toBeVisible();
  await expect(main(page).getByText("From archetype")).toBeVisible();
  await expect(
    main(page)
      .getByRole("link", { name: "EJB to CDI conversion patterns" })
      .first()
  ).toBeVisible();
});

test("plan run detail lists its resolved skills below the stages", async ({
  page,
}) => {
  await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
  const stages = page.getByRole("heading", { name: "Stages" });
  const resolved = page.getByRole("heading", { name: "Resolved skills" });
  await expect(stages).toBeVisible();
  await expect(resolved).toBeVisible();
  const [stagesBox, resolvedBox] = await Promise.all([
    stages.boundingBox(),
    resolved.boundingBox(),
  ]);
  expect(resolvedBox!.y).toBeGreaterThan(stagesBox!.y);
  await expect(
    page
      .getByRole("grid", { name: "Resolved skills table" })
      .getByRole("link", { name: "Jakarta EE namespace migration" })
  ).toBeVisible();
});
