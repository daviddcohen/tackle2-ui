/**
 * Writes invalidate every query that depends on the changed entity. MSW state
 * lives in the page, so these tests stay on one page load and check the UI
 * against the mock API afterwards.
 */
import {
  type Named,
  agenticGet,
  dialog,
  expect,
  gotoProto,
  main,
  mainHeading,
  spaNavigate,
  test,
} from "../support";

interface PlanWithSkills extends Named {
  effectiveSkills?: { skill: Named }[];
  stages: Named[];
}

test("skill detail: the plans-resolving-skill table refreshes after its associations are cleared", async ({
  page,
}) => {
  await gotoProto(page, "/skills/3?tab=associations", {
    persona: "platformEngineer",
  });
  const plansTable = page.getByRole("grid", {
    name: "Migration plans where this skill is active",
  });
  await expect(plansTable.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await dialog(page).getByRole("button", { name: "Clear input value" }).click();
  await expect(
    dialog(page).getByRole("button", { name: /^Remove / })
  ).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(dialog(page)).toHaveCount(0);

  // The server recomputed the plans' effective skills ...
  const plans = await agenticGet<PlanWithSkills[]>(page, "/plans");
  expect(
    plans.filter((plan) =>
      (plan.effectiveSkills ?? []).some((entry) => `${entry.skill.id}` === "3")
    )
  ).toEqual([]);
  // ... and the page shows it without a reload.
  await expect(plansTable).toHaveCount(0);
});

test("editing a plan keeps its stage ids, so its runs keep their stage runs", async ({
  page,
}) => {
  await gotoProto(page, "/plan-runs/2");
  await expect(mainHeading(page)).toHaveText(/^Run #2/);
  const viewRunLinks = main(page).getByRole("link", { name: "View run" });
  await expect(viewRunLinks.first()).toBeVisible();
  const stageRunCount = await viewRunLinks.count();
  const before = await agenticGet<PlanWithSkills>(page, "/plans/2");
  expect(before.stages.map((stage) => stage.id)).toEqual(["4", "5", "6"]);

  await main(page)
    .locator("dl")
    .getByRole("link", { name: "Spring Boot to Quarkus" })
    .click();
  await page.getByRole("button", { name: "Edit Plan" }).click();
  const wizard = dialog(page);
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Save Changes" }).click();
  await expect(wizard).toHaveCount(0);

  const after = await agenticGet<PlanWithSkills>(page, "/plans/2");
  expect(after.stages.map((stage) => stage.id)).toEqual(["4", "5", "6"]);

  await page.goBack();
  await expect(viewRunLinks).toHaveCount(stageRunCount);
  // A stage run of the edited plan still resolves (in-app, same mock state).
  await spaNavigate(page, "/plan-runs/2/stages/4");
  await expect(mainHeading(page)).toHaveText(/^Analyze: Run #2/);
  await expect(page.getByText(/not found/i)).toHaveCount(0);
});
