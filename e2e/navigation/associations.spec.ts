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

test("skill usage lists attachments, collections and plans", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills/3?tab=usage"));
  await expect(mainHeading(page)).toHaveText("Jakarta EE namespace migration");
  for (const section of [
    /^Attached to \(\d+\)$/,
    /^In skill collections \(\d+\)$/,
    /^Used in migration plans \(\d+\)$/,
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

test("an application a skill is attached to links to its Skills tab", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills/5?tab=usage"));
  await expect(
    main(page).getByRole("link", { name: "Customer Management" }).first()
  ).toHaveAttribute(
    "href",
    new RegExp(`^${withBase("/applications/1")}\\?tab=skills\\b`)
  );
});

test("plan detail links its stage agents and skills and shows where each skill comes from", async ({
  page,
}) => {
  await page.goto(protoUrl("/migration-plans/1"));
  await expect(mainHeading(page)).toHaveText("Java EE to Quarkus");
  await expect(
    main(page).getByRole("heading", { level: 2, name: "Skills by stage" })
  ).toBeVisible();
  const skills = page.getByRole("grid", { name: "Skills by stage" });
  await expect(
    skills.getByRole("columnheader", { name: "From" })
  ).toBeVisible();
  // A skill shows in each group that gets it, with that group's origins, one
  // line per origin, each name a link.
  const jakarta = skills.getByRole("row", {
    name: /Jakarta EE namespace migration/,
  });
  const everyStage = jakarta.filter({ hasText: "Archetype:" });
  await expect(everyStage).toHaveCount(1);
  await expect(everyStage).toContainText("Archetype: Java EE Application");
  await expect(everyStage).toContainText("Target profile: Quarkus 3.x");
  await expect(everyStage.getByRole("link")).toHaveCount(3);
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
  // Stages are numbered, as on the skill page.
  await expect(
    main(page).getByRole("row", { name: /Java EE to Quarkus/ })
  ).toContainText("Stage 1: Prepare proposal");
  await expect(
    main(page).getByRole("link", { name: "API compatibility checklist" })
  ).toBeVisible();
});

test("application skills tab lists its own skills, then each archetype's", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications/1?tab=skills"));
  const group = (name: RegExp) => main(page).getByRole("region", { name });
  await expect(
    group(/^Application skills/).getByRole("link", {
      name: "Corporate coding standards",
    })
  ).toBeVisible();
  // One section for every archetype: a term per archetype, its skills beside it.
  const archetypes = group(/^Archetype skills/);
  await expect(
    archetypes.getByRole("link", { name: "EJB to CDI conversion patterns" })
  ).toBeVisible();
  // The archetype's name links where its skills are edited.
  await expect(
    archetypes
      .getByRole("term")
      .getByRole("link", { name: "Java EE Application" })
  ).toHaveAttribute("href", /\/archetypes\?.*activeItem=1/);
  // A target profile is picked when a migration plan runs: its skills are
  // not the application's, and neither are the agents' own.
  await expect(main(page)).not.toContainText("Target profile skills");
  // No intro: each section says what its skills are for.
  await expect(main(page)).not.toContainText("When a migration plan runs");
  await expect(main(page).getByRole("grid")).toHaveCount(0);
});

test("plan run detail lists its skills below the stages", async ({ page }) => {
  await page.goto(protoUrl("/plan-runs/1", { scenario: "completed" }));
  const stages = page.getByRole("heading", { name: "Stages" });
  const resolved = page.getByRole("heading", {
    level: 2,
    name: "Skills by stage",
  });
  await expect(stages).toBeVisible();
  await expect(resolved).toBeVisible();
  const [stagesBox, resolvedBox] = await Promise.all([
    stages.boundingBox(),
    resolved.boundingBox(),
  ]);
  expect(resolvedBox!.y).toBeGreaterThan(stagesBox!.y);
  await expect(
    page
      .getByRole("grid", { name: "Skills by stage" })
      .getByRole("link", { name: "Jakarta EE namespace migration" })
      .first()
  ).toBeVisible();
});
