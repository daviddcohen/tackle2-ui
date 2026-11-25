/**
 * Manage skills on the Hub entities (archetype, target profile, application):
 * the same attachments the skill form edits, from the other side. Every
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
// Attached to nothing in the fixtures.
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

/** Opens the archetype's drawer, on its Details tab. */
const openArchetypeDrawer = async (page: Page, archetype: string) => {
  await rowByText(page, archetype)
    .getByText(archetype, { exact: true })
    .click();
  const drawer = page.locator("#page-drawer-content");
  await expect(
    drawer.getByRole("tab", { name: "Details", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  return drawer;
};

/** The Skills fact of the drawer's Details tab: link labels, "None" when empty. */
const skillsFact = (drawer: Locator) =>
  drawer.locator(".pf-v6-c-description-list__group").filter({
    has: drawer.page().getByRole("term").getByText("Skills", { exact: true }),
  });

/** The skill's "Attached to" facts on its Usage tab. */
const attachedTo = async (page: Page, skillId: string) => {
  await spaNavigate(page, `/skills/${skillId}?tab=usage`);
  return main(page).getByRole("region", { name: /^Attached to/ });
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

/** The application Skills tab's own group: "Application skills ({n})". */
const applicationSkills = (page: Page) =>
  main(page).getByRole("region", { name: /^Application skills/ });

/** The application group's Manage skills button, named after the application. */
const manageApplicationSkills = (page: Page, application: string) =>
  applicationSkills(page).getByRole("button", {
    name: `Manage skills for ${application}`,
  });

test.describe("Manage skills: archetype", () => {
  test("attach a skill from the row actions, see it on the skill and in the drawer", async ({
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
      "Select the skills to attach to this archetype. Agents can use them whichever target profile a run uses, so attach a skill that fits only one target to that target profile instead."
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

    const drawer = await openArchetypeDrawer(page, "Java EE Application");
    await expect(
      skillsFact(drawer).getByRole("link", { name: NEW_SKILL })
    ).toHaveAttribute("href", /\/skills\/16(\?|$)/);

    await expect(
      (await attachedTo(page, "16")).getByRole("link", {
        name: "Java EE Application",
      })
    ).toBeVisible();
    expectHealthy(diagnostics);
  });

  test("remove a skill from the drawer's Skills fact", async ({ page }) => {
    await gotoProto(page, "/archetypes");
    const drawer = await openArchetypeDrawer(page, "Java EE Application");
    const own = skillsFact(drawer);
    const link = own.getByRole("link", {
      name: "EJB to CDI conversion patterns",
    });
    await expect(link).toBeVisible();

    await own
      .getByRole("button", { name: "Manage skills for Java EE Application" })
      .click();
    await chip(page, "EJB to CDI conversion patterns").click();
    await save(page, "Skills for Java EE Application updated");

    await expect(link).toHaveCount(0);
    // The other attached skill stays.
    await expect(
      own.getByRole("link", { name: "Jakarta EE namespace migration" })
    ).toBeVisible();
    await expect(
      (await attachedTo(page, "2")).getByRole("link", {
        name: "Java EE Application",
      })
    ).toHaveCount(0);
  });

  test("a save that fills an empty Skills fact leaves focus on Manage skills", async ({
    page,
  }) => {
    // Empty the fact first: the archetype's one skill.
    await gotoProto(page, "/archetypes");
    const drawer = await openArchetypeDrawer(page, "Node.js Service");
    const button = skillsFact(drawer).getByRole("button", {
      name: "Manage skills for Node.js Service",
    });
    await expect(button).toHaveId(/^manage-skills-archetype-\d+$/);
    await button.click();
    await chip(page, "Node.js runtime modernization").click();
    await save(page, "Skills for Node.js Service updated");
    await expect(skillsFact(drawer).getByRole("definition")).toHaveText(
      /^None/
    );
    await expect(skillsFact(drawer).getByRole("link")).toHaveCount(0);

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
      skillsFact(drawer).getByRole("link", { name: NEW_SKILL })
    ).toBeVisible();
    await expect(button).toBeFocused();
  });

  test("the drawer lists no target profile skills and points to the target profiles page", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes");
    const drawer = await openArchetypeDrawer(page, "Java EE Application");
    // The Skills tab is gone: the archetype's skills are a Details fact.
    await expect(
      drawer.getByRole("tab", { name: "Skills", exact: true })
    ).toHaveCount(0);
    await expect(
      skillsFact(drawer).getByRole("link", {
        name: "EJB to CDI conversion patterns",
      })
    ).toBeVisible();
    // A target profile is a migration path: its skills come with a run on
    // it, so the archetype does not list them.
    await expect(
      drawer.getByRole("link", { name: "Quarkus best practices" })
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Manage skills for Quarkus 3.x" })
    ).toHaveCount(0);
    await skillsFact(drawer)
      .getByRole("button", { name: "More about archetype skills" })
      .click();
    const help = page.getByRole("dialog", { name: "Skills", exact: true });
    await expect(help).toHaveText(
      /Agents can use these skills in every stage when they migrate applications in this archetype, whichever target profile the run uses\. Each target profile adds its own skills when a run uses it: View target profiles/
    );
    await help.getByRole("link", { name: "View target profiles" }).click();
    await expect(page).toHaveURL(/\/archetypes\/1\/target-profiles(\?|$)/);

    // Each profile's own skills are there as links, with its own Manage
    // skills, and the column help says when agents use them.
    const row = rowByText(page, "Quarkus 3.x");
    for (const skill of [
      "Jakarta EE namespace migration",
      "Quarkus best practices",
    ])
      await expect(row.getByRole("link", { name: skill })).toBeVisible();
    await main(page)
      .getByRole("button", { name: "More about target profile skills" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Skills", exact: true })
    ).toContainText(
      "Agents can use these skills in every stage when a migration plan runs on this target profile."
    );
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
  test("attach a skill from the row actions, see it in the Skills column and on the skill", async ({
    page,
  }) => {
    await gotoProto(page, "/archetypes/1/target-profiles");
    const row = rowByText(page, "Quarkus 3.x");
    await expect(
      row.getByRole("link", { name: "Quarkus best practices" })
    ).toBeVisible();
    await expect(row.getByRole("link", { name: NEW_SKILL })).toHaveCount(0);
    await openRowActions(page, "Quarkus 3.x");
    await menuItem(page, MANAGE).click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Quarkus 3.x (Java EE Application)"
    );
    await expect(skillsPicker(page)).toHaveAccessibleDescription(
      "Select the skills to attach to this target profile. Skills for Java EE Application itself are attached on the archetype."
    );
    await expect(chip(page, "Quarkus best practices")).toBeVisible();

    await pickSkill(page, NEW_SKILL);
    await save(page, "Skills for Quarkus 3.x (Java EE Application) updated");
    // The Skills cell lists every skill, the new one included.
    await expect(row.getByRole("link", { name: NEW_SKILL })).toHaveAttribute(
      "href",
      /\/skills\/16(\?|$)/
    );
    await expect(
      row.getByRole("link", { name: "Quarkus best practices" })
    ).toBeVisible();

    await expect(
      (await attachedTo(page, "16")).getByRole("link", {
        name: "Quarkus 3.x (Java EE Application)",
      })
    ).toBeVisible();
  });
});

test.describe("Manage skills: application", () => {
  test("attach a skill from the Skills tab and see it there and on the skill", async ({
    page,
  }) => {
    await gotoProto(page, "/applications/1?tab=skills");
    // Manage skills is on the Skills tab and in the Actions menu, like the
    // inventory row menu.
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(menuItem(page, MANAGE)).toBeVisible();
    await page.keyboard.press("Escape");
    await manageApplicationSkills(page, "Customer Management").click();
    await expect(manageDialog(page)).toHaveAccessibleName(
      "Manage skills for Customer Management"
    );
    await expect(skillsPicker(page)).toHaveAccessibleDescription(
      "Select the skills to attach to this application. Archetype skills are attached on each archetype, and target profile skills on each archetype's target profiles page."
    );
    await expect(chip(page, "Corporate coding standards")).toBeVisible();

    await pickSkill(page, NEW_SKILL);
    await save(page, "Skills for Customer Management updated");
    await expect(
      applicationSkills(page).getByRole("link", { name: NEW_SKILL })
    ).toBeVisible();

    await expect(
      (await attachedTo(page, "16")).getByRole("link", {
        name: "Customer Management",
      })
    ).toBeVisible();
  });

  test("the Skills tab button and the inventory row action edit the same set", async ({
    page,
  }) => {
    await gotoProto(page, "/applications/1?tab=skills");
    await manageApplicationSkills(page, "Customer Management").click();
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
    const item = applicationSkills(page).getByRole("link", {
      name: "Corporate coding standards",
    });
    await expect(item).toBeVisible();
    const manage = manageApplicationSkills(page, "Customer Management");
    await manage.click();
    await chip(page, "Corporate coding standards").click();
    await save(page, "Skills for Customer Management updated");
    await expect(item).toHaveCount(0);
    await expect(applicationSkills(page)).toContainText(
      "No skills are attached to this application."
    );
    // Focus returns to the button that opened the modal.
    await expect(manage).toBeFocused();
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
  const drawer = await openArchetypeDrawer(page, "Java EE Application");
  await expect(
    skillsFact(drawer).getByRole("link", {
      name: "EJB to CDI conversion patterns",
    })
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: /^Manage skills/ })
  ).toHaveCount(0);

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
  await expect(
    applicationSkills(page).getByRole("link", {
      name: "Corporate coding standards",
    })
  ).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: /^Manage skills/ })
  ).toHaveCount(0);
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
