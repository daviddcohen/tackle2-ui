/**
 * Skill associations edited from either side reach the plan skill review:
 * Manage skills on an archetype, a target profile or an application, and the
 * collection pickers of the skill and skill collection forms, change what the
 * plan wizard's Skills step, the plan page, the skill page, the application
 * Skills tab and the Run migration plan dialog list. Each test reads a view first,
 * so the later check also proves the write refreshed it. MSW state lives in
 * the page, so every step after the first navigates inside the app.
 */
import type { Locator, Page } from "@playwright/test";

import {
  dialog,
  expect,
  expectHealthy,
  gotoProto,
  main,
  mainHeading,
  openRowActions,
  pickMulti,
  pickRunTargetProfile,
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
// Used by target profiles of Java EE Application and Legacy Java Application.
const SHARED_PLAN_PATH = "/migration-plans/3";
const SHARED_PLAN = "Java lift and shift";
const APPLICATION_PATH = "/applications/13";
const APPLICATION = "Branch Operations";
// In no Legacy Java Application plan, archetype or agent in the fixtures.
const SKILL = "Spring Boot 3 upgrade";
const SKILL_ID = "16";
// In no Legacy Java Application plan, archetype, agent or collection either.
const OTHER_SKILL = ".NET 8 migration";

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

/** The application Skills tab's own group ("Application skills ({n})"). */
const applicationSkills = (page: Page) =>
  main(page).getByRole("region", { name: /^Application skills/ });

/**
 * From the application page, before any run: the Migration tab says skills
 * are resolved when a plan runs, so open the Run migration plan dialog from
 * its Stages section, pick the target profile it runs on and expand Skills
 * by stage and the application's Every stage group.
 */
const openRunSkillsPreview = async (page: Page) => {
  await page.getByRole("tab", { name: "Migration", exact: true }).click();
  await expect(
    main(page).getByRole("region", { name: "Skills by stage" })
  ).toContainText(
    "Skills are resolved for each stage when a migration plan runs on this application."
  );
  await main(page)
    .getByRole("region", { name: "Stages" })
    .getByRole("button", { name: "Run migration plan", exact: true })
    .click();
  const preflight = dialog(page, "Run migration plan");
  // Two of its target profiles have a plan: the run needs a pick.
  await pickRunTargetProfile(
    page,
    preflight,
    APPLICATION,
    "Java 17 on OpenShift"
  );
  await preflight.getByRole("button", { name: "Skills by stage" }).click();
  await preflight
    .getByRole("button", { name: new RegExp(`Every stage: ${APPLICATION}`) })
    .click();
  return preflight;
};

/** Skills by stage on the plan page and in the wizard's Skills step. */
const stageSkillsGrid = (scope: Locator) =>
  scope.getByRole("grid", { name: "Skills by stage", exact: true });

/** Every row of a skill in Skills by stage: one per group that has it. */
const stageSkillRows = (scope: Locator, skill: string) =>
  stageSkillsGrid(scope).getByRole("row").filter({ hasText: skill });

/** The Include checkbox of a skill in one group ("every stage", "stage 2"). */
const includeBox = (scope: Locator, skill: string, group = "every stage") =>
  scope.getByRole("checkbox", {
    name: `Include ${skill} in ${group}`,
    exact: true,
  });

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
    await expect(stageSkillsGrid(main(page))).toBeVisible();
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(0);

    await spaNavigate(page, "/archetypes");
    await openRowActions(page, ARCHETYPE);
    await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    await addSkillInModal(page, SKILL, `Skills for ${ARCHETYPE} updated`);

    // The cached plan page refetches its resolution: every stage gets it.
    await spaNavigate(page, PLAN_PATH);
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(1);
    await expect(stageSkillRows(main(page), SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );

    // The wizard's Skills step lists it, and excluding it sticks.
    const wizard = await openPlanEdit(page);
    await expect(wizard.getByText("No skills excluded.")).toBeVisible();
    await expect(stageSkillRows(wizard, SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );
    await includeBox(wizard, SKILL).uncheck();
    await wizard.getByRole("button", { name: "Review", exact: true }).click();
    // Alone, the name needs no "Newly excluded:" under "Excluded skills".
    await expect(wizard).toContainText(`${SKILL} (every stage)`);
    await expect(wizard).not.toContainText("Newly excluded");
    await wizard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(wizard).toBeHidden();
    await expect(toast(page, "Migration plan updated")).toBeVisible();
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(1);
    await expect(stageSkillRows(main(page), SKILL)).toContainText("Excluded");

    // The skill page lists the plan, marked on the row it reaches: an
    // archetype skill reaches every stage.
    await spaNavigate(page, `/skills/${SKILL_ID}?tab=usage`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    const planRow = plans.getByRole("row").filter({ hasText: PLAN });
    await expect(planRow).toHaveCount(1);
    await expect(planRow).toContainText("Every stage");
    await expect(planRow).toContainText("Excluded");
    expectHealthy(diagnostics);
  });

  test("a target profile skill from Manage skills shows in the Skills step of the plan it uses", async ({
    page,
  }) => {
    // Java 8 on OpenShift uses Java lift and shift, which a Java EE target
    // profile uses too: the skill reaches that plan's Every stage.
    await gotoProto(page, `/archetypes/3/target-profiles`);
    const profile = "Java 8 on OpenShift";
    const profileRow = rowByText(page, profile);
    await expect(profileRow).toContainText(SHARED_PLAN);
    await openRowActions(page, profile);
    await page.getByRole("menuitem", { name: MANAGE, exact: true }).click();
    await addSkillInModal(
      page,
      SKILL,
      `Skills for ${profile} (${ARCHETYPE}) updated`
    );

    await spaNavigate(page, SHARED_PLAN_PATH);
    await expect(mainHeading(page)).toHaveText(SHARED_PLAN);
    const wizard = await openPlanEdit(page);
    await expect(stageSkillRows(wizard, SKILL)).toHaveCount(1);
    await expect(stageSkillRows(wizard, SKILL)).toContainText(
      `Target profile: ${profile} (${ARCHETYPE})`
    );
    await expect(includeBox(wizard, SKILL)).toBeChecked();
  });

  test("an application skill from Manage skills reaches the Skills tab and the run dialog", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, `${APPLICATION_PATH}?tab=skills`);
    await expect(applicationSkills(page)).toBeVisible();
    await expect(
      applicationSkills(page).getByRole("link", { name: OTHER_SKILL })
    ).toHaveCount(0);

    await applicationSkills(page)
      .getByRole("button", { name: `Manage skills for ${APPLICATION}` })
      .click();
    await addSkillInModal(
      page,
      OTHER_SKILL,
      `Skills for ${APPLICATION} updated`
    );
    // The tab refreshes in place.
    await expect(
      applicationSkills(page).getByRole("link", { name: OTHER_SKILL })
    ).toBeVisible();

    // No run yet: the tab says where every stage's skills are listed.
    await expect(main(page)).toContainText(
      "Run migration plan lists them before the run starts, and you can exclude some for that run."
    );

    // Every stage of the run gets it, from this application.
    const preflight = await openRunSkillsPreview(page);
    const rows = stageSkillRows(preflight, OTHER_SKILL);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`Application: ${APPLICATION}`);
    expectHealthy(diagnostics);
  });

  test("collection edits from the skill and skill collection forms reach the plan page", async ({
    page,
  }) => {
    await gotoProto(page, PLAN_PATH);
    await expect(stageSkillsGrid(main(page))).toBeVisible();
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(0);
    await expect(
      stageSkillRows(main(page), "Platform security baseline")
    ).toHaveCount(0);

    // Skill form: the skill joins a collection that the plan's agents use.
    await spaNavigate(page, `/skills/${SKILL_ID}?tab=usage`);
    const plans = main(page).getByRole("grid", {
      name: "Used in migration plans",
    });
    // The skill reaches no plan yet.
    await expect(
      main(page).getByText("No migration plan gets this skill.", {
        exact: true,
      })
    ).toBeVisible();
    await editFromDetail(page);
    await pickMulti(page, "skill-skill-collections", [
      "Java modernization foundation",
    ]);
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill updated")).toBeVisible();
    // The open skill page lists the plan without a reload.
    // On the stage its agent runs, from the agent's collection.
    const planRow = plans.getByRole("row").filter({ hasText: PLAN });
    await expect(planRow).toContainText("Run by Java Code Migrator");
    await expect(planRow).toContainText(
      "Collection: Java modernization foundation"
    );

    // Collection form: a plan agent starts using another collection.
    await spaNavigate(page, "/skills/collections/4");
    await editFromDetail(page);
    await pickMulti(page, "skill-collection-agents", ["Build Validator"]);
    // Close the menu so it does not cover the footer buttons.
    await dialog(page).getByRole("heading").first().click();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Skill collection updated")).toBeVisible();

    await spaNavigate(page, PLAN_PATH);
    // Each in the stage whose agent uses the collection, and only there.
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(1);
    await expect(stageSkillRows(main(page), SKILL)).toContainText(
      "Collection: Java modernization foundation"
    );
    const baseline = stageSkillRows(main(page), "Platform security baseline");
    await expect(baseline).toHaveCount(1);
    await expect(baseline).toContainText("Collection: Security and compliance");
  });

  test("a skill attached only to applications says the applications add it when they run", async ({
    page,
  }) => {
    // Corporate coding standards: attached to three applications, nothing
    // else.
    await gotoProto(page, "/skills/5?tab=usage");
    const section = main(page).getByRole("heading", {
      name: "Used in migration plans",
      exact: true,
    });
    await expect(section).toBeVisible();
    await expect(
      main(page).getByText(
        "The stages of each migration plan that get this skill, and where it comes from. Application skills are added when a plan runs.",
        { exact: false }
      )
    ).toBeVisible();
    await expect(
      main(page).getByText(
        "No migration plan gets this skill from an agent, a collection, an archetype or a target profile. The applications it is attached to add it to every stage when they run.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      main(page).getByText(/migration plan uses this skill/)
    ).toHaveCount(0);
  });

  test("a plan's exclusion never applies to a skill attached to the application itself", async ({
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
    await includeBox(wizard, SKILL).uncheck();
    await wizard.getByRole("button", { name: "Review", exact: true }).click();
    await wizard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(toast(page, "Migration plan updated")).toBeVisible();

    await spaNavigate(page, `${APPLICATION_PATH}?tab=skills`);
    await applicationSkills(page)
      .getByRole("button", { name: `Manage skills for ${APPLICATION}` })
      .click();
    await addSkillInModal(page, SKILL, `Skills for ${APPLICATION} updated`);
    // Both the archetype and the application give it; the plan excludes it,
    // but the application's own attachment wins.
    let preflight = await openRunSkillsPreview(page);
    const everyStage = stageSkillRows(preflight, SKILL);
    await expect(everyStage).toContainText(`Application: ${APPLICATION}`);
    await expect(everyStage).toContainText(`Archetype: ${ARCHETYPE}`);
    await expect(everyStage).not.toContainText("Excluded");
    await preflight.getByRole("button", { name: "Cancel" }).click();
    await expect(preflight).toBeHidden();
    // The plan page still shows it excluded (it has no application).
    await spaNavigate(page, PLAN_PATH);
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(1);
    await expect(stageSkillRows(main(page), SKILL)).toContainText("Excluded");

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
    // The first save's toast can still be up: wait for the newest one.
    await expect(
      toast(page, `Skills for ${ARCHETYPE} updated`).last()
    ).toBeVisible();

    // The plan page no longer lists it, so the application does not show it
    // as excluded by that plan either.
    await spaNavigate(page, PLAN_PATH);
    await expect(stageSkillsGrid(main(page))).toBeVisible();
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(0);
    await expect(main(page).getByText("Excluded", { exact: true })).toHaveCount(
      0
    );
    await spaNavigate(page, `${APPLICATION_PATH}?tab=skills`);
    await expect(
      applicationSkills(page).getByRole("link", { name: SKILL })
    ).toBeVisible();
    preflight = await openRunSkillsPreview(page);
    const row = stageSkillRows(preflight, SKILL);
    await expect(row).toContainText(`Application: ${APPLICATION}`);
    await expect(row).not.toContainText("Excluded");
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
    // The archetype's own group, the only one: target profiles have theirs
    // on the target profiles page.
    await drawer
      .getByRole("button", { name: `${MANAGE} for ${ARCHETYPE}` })
      .click();
    await addSkillInModal(page, SKILL, `Skills for ${ARCHETYPE} updated`);
    await expect(
      drawer
        .getByRole("region", { name: /^Archetype skills/ })
        .getByRole("link", { name: SKILL })
    ).toBeVisible();

    await spaNavigate(page, PLAN_PATH);
    await expect(stageSkillRows(main(page), SKILL)).toHaveCount(1);
    await expect(stageSkillRows(main(page), SKILL)).toContainText(
      `Archetype: ${ARCHETYPE}`
    );
  });
});
