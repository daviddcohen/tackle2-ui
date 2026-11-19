/**
 * Manage skills on the Hub entities (archetype, target profile, application):
 * the same associations the skill form edits, from the other side. Every
 * write is checked on the skill side and back, in-app (MSW state lives in
 * the page).
 */
import type { Locator, Page } from "@playwright/test";

import {
  type Persona,
  dialog,
  expect,
  expectHealthy,
  filterByName,
  gotoProto,
  main,
  openRowActions,
  pickMulti,
  rowByText,
  spaNavigate,
  test,
  toast,
} from "../support";

const MANAGE = "Manage skills";
const SELECT = "manage-skills-select";
// Associated with no archetype or application in the fixtures; only with a
// Spring Boot target profile.
const NEW_SKILL = "Spring Boot 3 upgrade";

const manageDialog = (page: Page) => dialog(page, MANAGE);

/** The chip of a selected skill in the open modal (its remove button). */
const chip = (page: Page, skill: string) =>
  manageDialog(page).getByRole("button", { name: `Remove ${skill}` });

/**
 * Toggles a skill in the open modal's picker, then closes its menu with
 * Escape (the picker claims the first Escape; the modal stays open).
 */
const pickSkill = async (page: Page, skill: string) => {
  await page.locator(`#${SELECT}-input`).click();
  const menu = page.locator(`#${SELECT}-listbox`);
  await menu.getByText(skill, { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(manageDialog(page)).toBeVisible();
};

const save = async (page: Page, toastText: string) => {
  await manageDialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page, toastText)).toBeVisible();
  await expect(manageDialog(page)).toHaveCount(0);
};

const openArchetypeDrawerSkills = async (page: Page, archetype: string) => {
  await rowByText(page, archetype)
    .getByText(archetype, { exact: true })
    .click();
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
  return page.locator("#page-drawer-content");
};

/** The skill's "Associated with" table on its Associations tab. */
const associatedWith = async (page: Page, skillId: string) => {
  await spaNavigate(page, `/skills/${skillId}?tab=associations`);
  return main(page).getByRole("grid", { name: /^Associated with/ });
};

/**
 * Delays every later skills read by `ms`. The app reads with XMLHttpRequest
 * and MSW answers in the page, so the delay goes in before the request is
 * sent.
 */
const slowSkillReads = (page: Page, ms: number) =>
  page.evaluate((delay) => {
    const urls = new WeakMap<XMLHttpRequest, string>();
    const { open, send } = XMLHttpRequest.prototype;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: [boolean?, string?, string?]
    ) {
      urls.set(this, `${method} ${url}`);
      return (open as (...args: unknown[]) => void).call(
        this,
        method,
        url,
        ...rest
      );
    } as typeof open;
    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      if (/^GET \S*\/skills(\?|$)/.test(urls.get(this) ?? "")) {
        setTimeout(() => send.call(this, body), delay);
        return;
      }
      send.call(this, body);
    };
  }, ms);

const menuItem = (page: Page, name: string) =>
  page.getByRole("menuitem", { name, exact: true });

/** The picker's typeahead input, described by the field helper. */
const skillsPicker = (page: Page) =>
  manageDialog(page).getByRole("combobox", { name: "Skills", exact: true });

const skillsGrid = (scope: Page | Locator) =>
  scope.getByRole("grid", { name: "Skills", exact: true });

test.describe("Manage skills: archetype", () => {
  test("associate a skill from the row actions, see it on the skill and in the drawer", async ({
    page,
    diagnostics,
  }) => {
    await gotoProto(page, "/archetypes");
    await openRowActions(page, "Java EE Application");
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Java EE Application"
    );
    await expect(skillsPicker(page)).toHaveAccessibleDescription(
      "Select the skills to associate directly with this archetype. Skills for its target profiles are managed on the target profiles page."
    );
    // Direct skills only: preselected and Save waits for a change.
    await expect(chip(page, "EJB to CDI conversion patterns")).toBeVisible();
    await expect(chip(page, "Jakarta EE namespace migration")).toBeVisible();
    await expect(
      manageDialog(page).getByRole("button", { name: "Save" })
    ).toBeDisabled();

    await pickSkill(page, NEW_SKILL);
    await expect(chip(page, NEW_SKILL)).toBeVisible();
    await save(page, "Skills for Java EE Application updated");

    const drawer = await openArchetypeDrawerSkills(page, "Java EE Application");
    await expect(
      skillsGrid(drawer).getByRole("row", { name: new RegExp(NEW_SKILL) })
    ).toContainText("Archetype: Java EE Application");

    await expect(
      (await associatedWith(page, "16")).getByRole("link", {
        name: "Java EE Application",
      })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("remove a skill from the drawer Skills tab", async ({ page }) => {
    await gotoProto(page, "/archetypes");
    const drawer = await openArchetypeDrawerSkills(page, "Java EE Application");
    const row = skillsGrid(drawer).getByRole("row", {
      name: /EJB to CDI conversion patterns/,
    });
    await expect(row).toBeVisible();

    await drawer.getByRole("button", { name: MANAGE }).click();
    await chip(page, "EJB to CDI conversion patterns").click();
    await save(page, "Skills for Java EE Application updated");

    await expect(row).toHaveCount(0);
    // Its target profile keeps the other direct skill's row.
    await expect(
      skillsGrid(drawer).getByRole("row", {
        name: /Jakarta EE namespace migration/,
      })
    ).toBeVisible();
    await expect(
      (await associatedWith(page, "2")).getByRole("link", {
        name: "Java EE Application",
      })
    ).toHaveCount(0);
  });

  test("a save that fills an empty Skills tab leaves focus on Manage skills", async ({
    page,
  }) => {
    // Empty the tab first: one skill comes from the archetype's only target
    // profile, one from the archetype.
    await gotoProto(page, "/archetypes/5/target-profiles");
    await openRowActions(page, "Node.js 22 on OpenShift");
    await menuItem(page, MANAGE).click();
    await chip(page, "OpenShift deployment conventions").click();
    await save(
      page,
      "Skills for Node.js 22 on OpenShift (Node.js Service) updated"
    );
    await spaNavigate(page, "/archetypes");
    const drawer = await openArchetypeDrawerSkills(page, "Node.js Service");
    const button = drawer.getByRole("button", { name: MANAGE });
    await button.click();
    await chip(page, "Node.js runtime modernization").click();
    await save(page, "Skills for Node.js Service updated");
    await expect(drawer.getByText("No skills yet")).toBeVisible();

    // The mock answers at once; a real server does not. Hold the skills
    // reads so the refetch lands after the modal has returned focus, as it
    // would in production.
    await slowSkillReads(page, 500);
    // From the keyboard, as the empty state's user would.
    await button.focus();
    await page.keyboard.press("Enter");
    await pickSkill(page, NEW_SKILL);
    // The first save's toast may still show, so wait for the dialog only.
    await manageDialog(page).getByRole("button", { name: "Save" }).click();
    await expect(manageDialog(page)).toHaveCount(0);
    await expect(
      skillsGrid(drawer).getByRole("row", { name: new RegExp(NEW_SKILL) })
    ).toBeVisible();
    await expect(button).toBeFocused();
  });

  test("Cancel and Escape close without saving and return focus to the kebab", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes");
    const kebab = rowByText(page, "Java EE Application").getByRole("button", {
      name: "Row actions",
    });
    await kebab.click();
    await menuItem(page, MANAGE).click();
    await expect(page.locator(`#${SELECT}-input`)).toBeFocused();
    await manageDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(manageDialog(page)).toHaveCount(0);
    await expect(kebab).toBeFocused();

    await kebab.click();
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(manageDialog(page)).toHaveCount(0);
    await expect(kebab).toBeFocused();
  });
});

test.describe("Manage skills: target profile", () => {
  test("associate a skill from the row actions, see it in the Skills column and on the skill", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes/1/target-profiles");
    const row = rowByText(page, "Quarkus 3.x");
    await expect(
      row.getByRole("button", { name: "2 skills", exact: true })
    ).toBeVisible();
    await openRowActions(page, "Quarkus 3.x");
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Quarkus 3.x (Java EE Application)"
    );
    await expect(skillsPicker(page)).toHaveAccessibleDescription(
      "Select the skills to associate directly with this target profile. Skills for Java EE Application itself are managed on the archetypes page."
    );
    await expect(chip(page, "Quarkus best practices")).toBeVisible();

    await pickSkill(page, NEW_SKILL);
    await save(page, "Skills for Quarkus 3.x (Java EE Application) updated");
    await expect(
      row.getByRole("button", { name: "3 skills", exact: true })
    ).toBeVisible();

    await expect(
      (await associatedWith(page, "16")).getByRole("link", {
        name: "Quarkus 3.x (Java EE Application)",
      })
    ).toBeVisible();
  });
});

test.describe("Manage skills: application", () => {
  test("associate a skill from the Actions menu and see it on the Skills tab and the skill", async ({
    page,
  }) => {
    await gotoProto(page, "/applications/1?tab=skills");
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Customer Management"
    );
    await expect(skillsPicker(page)).toHaveAccessibleDescription(
      "Select the skills to associate directly with this application. The Skills tab shows every skill for this application, where it comes from and whether its migration plan excludes it."
    );
    await expect(chip(page, "Corporate coding standards")).toBeVisible();

    await pickSkill(page, NEW_SKILL);
    await save(page, "Skills for Customer Management updated");
    await expect(
      skillsGrid(main(page)).getByRole("row", { name: new RegExp(NEW_SKILL) })
    ).toContainText("Application: Customer Management");

    await expect(
      (await associatedWith(page, "16")).getByRole("link", {
        name: "Customer Management",
      })
    ).toBeVisible();
  });

  test("the Skills tab button and the inventory row action edit the same set", async ({
    page,
  }) => {
    await gotoProto(page, "/applications/1?tab=skills");
    await main(page).getByRole("button", { name: MANAGE }).click();
    await pickSkill(page, NEW_SKILL);
    await save(page, "Skills for Customer Management updated");

    await spaNavigate(page, "/applications");
    await openRowActions(page, "Customer Management");
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Customer Management"
    );
    await expect(chip(page, NEW_SKILL)).toBeVisible();
    await expect(chip(page, "Corporate coding standards")).toBeVisible();
  });

  test("remove the only direct skill: the Skills tab drops it", async ({
    page,
  }) => {
    await gotoProto(page, "/applications/1?tab=skills");
    const row = skillsGrid(main(page)).getByRole("row", {
      name: /Corporate coding standards/,
    });
    await expect(row).toContainText("Application: Customer Management");
    await main(page).getByRole("button", { name: MANAGE }).click();
    await chip(page, "Corporate coding standards").click();
    await save(page, "Skills for Customer Management updated");
    await expect(row).toHaveCount(0);
  });
});

test("an edit in the skill form shows in the modal's preselection (two-way)", async ({
  page,
}) => {
  await gotoProto(page, "/skills");
  await filterByName(page, NEW_SKILL);
  await openRowActions(page, NEW_SKILL);
  await menuItem(page, "Edit").click();
  await pickMulti(page, "skill-archetypes", ["Java EE Application"]);
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page, "Skill updated")).toBeVisible();

  await spaNavigate(page, "/archetypes");
  await openRowActions(page, "Java EE Application");
  await menuItem(page, MANAGE).click();
  await expect(chip(page, NEW_SKILL)).toBeVisible();
});

const expectNoManageSkills = async (page: Page, persona: Persona) => {
  await gotoProto(page, "/archetypes", { persona });
  await expect(rowByText(page, "Java EE Application")).toBeVisible();
  const kebab = rowByText(page, "Java EE Application").getByRole("button", {
    name: "Row actions",
  });
  if ((await kebab.count()) > 0) {
    await kebab.click();
    await expect(menuItem(page, MANAGE)).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  const drawer = await openArchetypeDrawerSkills(page, "Java EE Application");
  await expect(skillsGrid(drawer)).toBeVisible();
  await expect(drawer.getByRole("button", { name: MANAGE })).toHaveCount(0);

  await spaNavigate(page, "/archetypes/1/target-profiles");
  await expect(rowByText(page, "Quarkus 3.x")).toBeVisible();
  const profileKebab = rowByText(page, "Quarkus 3.x").getByRole("button", {
    name: "Kebab toggle",
  });
  if ((await profileKebab.count()) > 0) {
    await profileKebab.click();
    await expect(menuItem(page, MANAGE)).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await spaNavigate(page, "/applications/1?tab=skills");
  await expect(skillsGrid(main(page))).toBeVisible();
  await expect(main(page).getByRole("button", { name: MANAGE })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await expect(menuItem(page, MANAGE)).toHaveCount(0);
};

test("hub migrator sees the skills but no Manage skills anywhere", async ({
  page,
}) => {
  await expectNoManageSkills(page, "hubMigrator");
  await spaNavigate(page, "/applications");
  await openRowActions(page, "Customer Management");
  await expect(menuItem(page, MANAGE)).toHaveCount(0);
});

test("platform engineer can manage skills", async ({ page }) => {
  await gotoProto(page, "/archetypes", { persona: "platformEngineer" });
  await openRowActions(page, "Java EE Application");
  await menuItem(page, MANAGE).click();
  await expect(chip(page, "EJB to CDI conversion patterns")).toBeVisible();
});
