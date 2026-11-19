/**
 * Skill associations edited from either side reach the plan skill review:
 * Manage skills on an archetype, a target profile or an application, and the
 * collection pickers of the skill and skill collection forms, change what the
 * plan wizard's Skills step, the plan page, the skill page, the application
 * tabs and the Run migration plan dialog list. Each test reads a view first,
 * so the later check also proves the write refreshed it. MSW state lives in
 * the page, so every step after the first navigates inside the app.
 */
import type { Locator, Page } from "@playwright/test";

import {
  dialog,
  expect,
  expectHealthy,
  field,
  gotoProto,
  main,
  openRowActions,
  pickMenuOption,
  pickMulti,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const MANAGE = "Manage skills";
const SELECT = "manage-skills-select";
const PLAN_PATH = "/migration-plans/5";
const PLAN = "Legacy Java runtime modernization";
const ARCHETYPE = "Legacy Java Application";
const APPLICATION_PATH = "/applications/13";
const APPLICATION = "Branch Operations";
// In no Legacy Java Application plan, archetype or agent in the fixtures.
const SKILL = "Spring Boot 3 upgrade";
const SKILL_ID = "16";
const OTHER_SKILL = "Database migration patterns";

const manageDialog = (page: Page) => dialog(page, /^Manage skills for /);

/** Adds `skill` in the open Manage skills modal and saves. */
const addSkillInModal = async (page: Page, skill: string, saved: string) => {
  await page.locator(`#${SELECT}-input`).click();
  const menu = page.locator(`#${SELECT}-listbox`);
  await menu.getByText(skill, { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await manageDialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page, saved)).toBeVisible();
  await expect(manageDialog(page)).toHaveCount(0);
};

const skillsGrid = (scope: Locator) =>
  scope.getByRole("grid", { name: "Skills", exact: true });

const skillRow = (scope: Locator, skill: string) =>
  skillsGrid(scope).getByRole("row").filter({ hasText: skill });

/** The plan page's Skills heading, as [used, total]. */
const planSkillCounts = async (page: Page): Promise<[number, number]> => {
  const heading = main(page).getByRole("heading", {
    name: /^Skills \(\d+( of \d+ used)?\)$/,
  });
  await expect(heading).toBeVisible();
  const [, first, second] =
    /\((\d+)(?: of (\d+) used)?\)/.exec((await heading.textContent()) ?? "") ??
    [];
  return [Number(first), Number(second ?? first)];
};

const openPlanEdit = async (page: Page) => {
  await main(page).getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const wizard = page.getByRole("dialog");
  await expect(
    wizard.getByRole("heading", { name: "Edit migration plan" })
  ).toBeVisible();
  await wizard.getByRole("button", { name: "Skills", exact: true }).click();
  return wizard;
};

const editFromDetail = async (page: Page) => {
  await main(page)
    .getByRole("button", { name: "Actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
};

test.describe("Skill associations in the plan skill review", () => {
  test("an archetype skill from Manage skills is reviewed, excluded and marked on the plan and skill pages", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, PLAN_PATH);
    const [, before] = await planSkillCounts(page);
    await expect(skillRow(main(page), SKILL)).toHaveCount(0);

    await spaNavigate(page, "/archetypes");
    await openRowActions(page, ARCHETYPE);
    await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    await addSkillInModal(page, SKILL, `Skills for ${ARCHETYPE} updated`);

    // The cached plan page refetches its resolution.
    await spaNavigate(page, PLAN_PATH);
    await expect(skillRow(main(page), SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );
    expect(await planSkillCounts(page)).toEqual([before + 1, before + 1]);

    // The wizard's Skills step lists it, and excluding it sticks.
    const wizard = await openPlanEdit(page);
    await expect(
      wizard.getByText(`${before + 1} of ${before + 1} skills will be used`)
    ).toBeVisible();
    await expect(skillRow(wizard, SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );
    await wizard
      .getByRole("checkbox", { name: `Use ${SKILL}`, exact: true })
      .uncheck();
    await wizard.getByRole("button", { name: "Review", exact: true }).click();
    await expect(wizard).toContainText(`Newly excluded: ${SKILL}`);
    await wizard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(wizard).toBeHidden();
    await expect(toast(page, "Migration plan updated")).toBeVisible();
    await expect(skillRow(main(page), SKILL)).toContainText("Excluded");
    expect(await planSkillCounts(page)).toEqual([before, before + 1]);

    // The skill page lists the plan, marked.
    await spaNavigate(page, `/skills/${SKILL_ID}?tab=associations`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    await expect(
      plans.getByRole("row").filter({ hasText: PLAN })
    ).toContainText("Excluded");
    expectHealthy(diagnostics);
  });

  test("a target profile skill from Manage skills shows in the new plan's Skills step", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes/3/target-profiles");
    await openRowActions(page, "Java 17 on RHEL");
    await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    await addSkillInModal(
      page,
      SKILL,
      `Skills for Java 17 on RHEL (${ARCHETYPE}) updated`
    );

    await spaNavigate(page, "/migration-plans");
    await page.getByRole("button", { name: "Create migration plan" }).click();
    const wizard = page.getByRole("dialog");
    await wizard.getByRole("textbox", { name: /^Name/ }).fill("RHEL review");
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await wizard.getByRole("button", { name: /^Archetype/ }).click();
    await pickMenuOption(page, ARCHETYPE);
    await wizard.locator("#plan-target-profiles-input").click();
    await pickMenuOption(page, "Java 17 on RHEL");
    await wizard.getByText(/^Applications in this archetype/).click();
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await wizard.getByRole("textbox", { name: "Stage name" }).fill("Migrate");
    await wizard.getByRole("button", { name: /^Agent/ }).click();
    await pickMenuOption(page, "Code Migrator");
    await wizard.getByRole("button", { name: "Next", exact: true }).click();

    await expect(skillRow(wizard, SKILL)).toContainText(
      "Target profile: Java 17 on RHEL"
    );
    await expect(
      wizard.getByRole("checkbox", { name: `Use ${SKILL}`, exact: true })
    ).toBeChecked();
  });

  test("an application skill from Manage skills reaches the Skills tab, the Migration tab and the run dialog", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, `${APPLICATION_PATH}?tab=skills`);
    await expect(skillsGrid(main(page))).toBeVisible();
    await expect(skillRow(main(page), OTHER_SKILL)).toHaveCount(0);
    const heading = main(page).getByRole("heading", {
      name: /^Skills \(\d+\)$/,
    });
    const before = Number(/\d+/.exec((await heading.textContent()) ?? "")![0]);

    await main(page).getByRole("button", { name: MANAGE }).click();
    await addSkillInModal(
      page,
      OTHER_SKILL,
      `Skills for ${APPLICATION} updated`
    );
    // The tab refreshes in place, with the server's provenance.
    await expect(skillRow(main(page), OTHER_SKILL)).toContainText(
      `Application: ${APPLICATION}`
    );
    await expect(
      main(page).getByRole("heading", { name: `Skills (${before + 1})` })
    ).toBeVisible();

    await page.getByRole("tab", { name: "Migration", exact: true }).click();
    await expect(main(page)).toContainText(`${before + 1} skills`);
    await main(page)
      .getByRole("button", { name: "Run migration plan", exact: true })
      .click();
    const preflight = dialog(page, "Run migration plan");
    await preflight
      .getByRole("button", { name: `Skills (${before + 1})` })
      .click();
    await expect(skillRow(preflight, OTHER_SKILL)).toContainText(
      `Application: ${APPLICATION}`
    );
    expectHealthy(diagnostics);
  });

  test("collection edits from the skill and skill collection forms reach the plan page", async ({
    page,
  }) => {
    await gotoProto(page, PLAN_PATH);
    await expect(skillsGrid(main(page))).toBeVisible();
    await expect(skillRow(main(page), SKILL)).toHaveCount(0);
    await expect(
      skillRow(main(page), "Platform security baseline")
    ).toHaveCount(0);

    // Skill form: the skill joins a collection that the plan's agents use.
    await spaNavigate(page, `/skills/${SKILL_ID}?tab=associations`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    await expect(plans).toBeVisible();
    await expect(plans.getByRole("row").filter({ hasText: PLAN })).toHaveCount(
      0
    );
    await editFromDetail(page);
    await pickMulti(page, "skill-skill-collections", [
      "Java modernization foundation",
    ]);
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();
    // The open skill page lists the plan without a reload.
    await expect(
      plans.getByRole("row").filter({ hasText: PLAN })
    ).toContainText("Agent: Code Migrator via Java modernization foundation");

    // Collection form: a plan agent starts using another collection.
    await spaNavigate(page, "/skills/collections/4");
    await editFromDetail(page);
    await pickMulti(page, "skill-collection-agents", ["Build Validator"]);
    // Close the menu so it does not cover the footer buttons.
    await field(dialog(page), "Description").click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill collection updated")).toBeVisible();

    await spaNavigate(page, PLAN_PATH);
    await expect(skillRow(main(page), SKILL)).toContainText(
      "Agent: Code Migrator via Java modernization foundation"
    );
    await expect(
      skillRow(main(page), "Platform security baseline")
    ).toContainText("Agent: Build Validator via Security and compliance");
  });

  test("a plan's exclusion stops applying to an application once the plan no longer resolves the skill", async ({
    page,
  }) => {
    const openManage = async (path: string, row: string) => {
      await spaNavigate(page, path);
      await openRowActions(page, row);
      await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    };
    await gotoProto(page, "/archetypes");
    await openRowActions(page, ARCHETYPE);
    await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    await addSkillInModal(page, SKILL, `Skills for ${ARCHETYPE} updated`);

    await spaNavigate(page, PLAN_PATH);
    const wizard = await openPlanEdit(page);
    await wizard
      .getByRole("checkbox", { name: `Use ${SKILL}`, exact: true })
      .uncheck();
    await wizard.getByRole("button", { name: "Review", exact: true }).click();
    await wizard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(toast(page, "Migration plan updated")).toBeVisible();

    await spaNavigate(page, `${APPLICATION_PATH}?tab=skills`);
    await main(page).getByRole("button", { name: MANAGE }).click();
    await addSkillInModal(page, SKILL, `Skills for ${APPLICATION} updated`);
    // Both the archetype and the application give it; the plan excludes it.
    await expect(skillRow(main(page), SKILL)).toContainText("Excluded");

    await openManage("/archetypes", ARCHETYPE);
    await manageDialog(page)
      .getByRole("button", { name: /^\d+ more$/ })
      .click();
    await manageDialog(page)
      .getByRole("button", { name: `Remove ${SKILL}` })
      .click();
    // The chip click opened the picker's menu: close it by clicking the
    // dialog heading so it does not cover Save.
    await manageDialog(page)
      .getByRole("heading", { name: `Manage skills for ${ARCHETYPE}` })
      .click();
    await manageDialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, `Skills for ${ARCHETYPE} updated`)).toBeVisible();

    // The plan page no longer lists it, so the application does not show it
    // as excluded by that plan either.
    await spaNavigate(page, PLAN_PATH);
    await expect(skillsGrid(main(page))).toBeVisible();
    await expect(skillRow(main(page), SKILL)).toHaveCount(0);
    await expect(main(page).getByText("Excluded", { exact: true })).toHaveCount(
      0
    );
    await spaNavigate(page, `${APPLICATION_PATH}?tab=skills`);
    const row = skillRow(main(page), SKILL);
    await expect(row).toContainText(`Application: ${APPLICATION}`);
    await expect(row).not.toContainText("Excluded");
    await expect(
      main(page).getByRole("heading", { name: /^Skills \(\d+\)$/ })
    ).toBeVisible();
  });

  test("Manage skills in the archetype drawer refreshes the drawer, then the plan page shows the skill", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes");
    await rowByText(page, ARCHETYPE)
      .getByText(ARCHETYPE, { exact: true })
      .click();
    await page.getByRole("tab", { name: "Skills", exact: true }).click();
    const drawer = page.locator("#page-drawer-content");
    await drawer.getByRole("button", { name: MANAGE }).click();
    await addSkillInModal(page, SKILL, `Skills for ${ARCHETYPE} updated`);
    await expect(skillRow(drawer, SKILL)).toBeVisible();

    await spaNavigate(page, PLAN_PATH);
    await expect(skillRow(main(page), SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );
  });
});
