/**
 * Locators and interactions shared across areas. Prefer roles and accessible
 * names; ids are used only for PatternFly typeahead inputs, whose accessible
 * name ("Type to filter") is not unique.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { type Persona, type Scenario, searchParam } from "./proto";

// ── App shell ────────────────────────────────────────────────────────────────

export const main = (page: Page) => page.getByRole("main");

export const mainHeading = (page: Page) =>
  main(page).getByRole("heading", { level: 1 });

export const breadcrumb = (page: Page) =>
  page.getByRole("navigation", { name: "Breadcrumb", exact: true });

export const breadcrumbTitles = async (page: Page) =>
  (await breadcrumb(page).getByRole("listitem").allInnerTexts()).map((text) =>
    text.trim()
  );

/** The current (last, plain-text) crumb. */
export const currentCrumb = (page: Page) =>
  breadcrumb(page).locator('[aria-current="page"]');

export const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Nav", exact: true });

/** NavLink marks the active item with PatternFly's class only (no aria-current). */
export const expectNavCurrent = async (page: Page, name: string) => {
  await expect(
    sidebar(page).getByRole("link", { name, exact: true })
  ).toHaveClass(/\bpf-m-current\b/);
};

/**
 * Waits for two animation frames: enough for React and PatternFly to apply a
 * state change that lands "a frame later" (e.g. an Escape handled by a popper
 * and then by the surrounding modal). Not a time-based sleep.
 */
export const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );

/**
 * Hovers `target` until its tooltip shows `text`. A menu that is still
 * positioning itself can move the item away from the pointer, so the hover is
 * retried rather than assumed to land.
 */
export const expectTooltipOnHover = async (
  page: Page,
  target: Locator,
  text: string | RegExp
) => {
  await expect(async () => {
    await target.hover({ force: true });
    await expect(page.getByRole("tooltip")).toContainText(text, {
      timeout: 1_500,
    });
  }).toPass();
};

export const errorBoundary = (page: Page) =>
  page.getByText("Oops! Something went wrong.");

export const toast = (page: Page, text: string | RegExp) =>
  page.locator(".pf-v6-c-alert-group").getByText(text);

export const dialog = (page: Page, name?: string | RegExp) =>
  page.getByRole("dialog", name == null ? undefined : { name });

/**
 * A labelled text field (input or textarea). Labels end with " *" when the
 * field is required, so match the label's start.
 */
export const field = (scope: Locator | Page, label: string) =>
  scope.getByRole("textbox", {
    name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  });

/**
 * An agentic status (run, stage, migration, verification, configuration):
 * `IconedStatus` renders a Flex whose first item is the status `Icon`, and the
 * Flex text is the status label. Other `IconedStatus` cells (for example the
 * inventory Analysis column) match too, so always scope it to a cell or row,
 * or take `.first()` in `main` only on a run page, whose header status leads.
 */
export const AGENTIC_STATUS = ".pf-v6-l-flex:has(> div > .pf-v6-c-icon)";

/** Text that must never be rendered to a user. */
const BROKEN_TEXT = [
  /\bundefined\b/,
  /\bNaN\b/,
  /\[object Object\]/,
  /Invalid Date/,
  // raw i18n keys
  /\bagentic\.[a-zA-Z]+\.[a-zA-Z.]+/,
  /\b(terms|actions|message|sidebar|composed)\.[a-z][a-zA-Z]+\b/,
];

export const expectNoBrokenText = async (scope: Locator) => {
  const text = await scope.innerText();
  for (const pattern of BROKEN_TEXT)
    expect(text, `rendered text matched ${pattern}`).not.toMatch(pattern);
};

// ── Prototype switcher ───────────────────────────────────────────────────────

export const switcher = (page: Page) =>
  page.getByRole("region", { name: "Prototype scope" });

export const personaSelect = (page: Page) =>
  switcher(page).getByRole("combobox", { name: "Persona" });

export const scenarioSelect = (page: Page) =>
  switcher(page).getByRole("combobox", { name: "Scenario" });

export const stageSelect = (page: Page) =>
  switcher(page).getByRole("combobox", { name: "Stage" });

export const perspectiveToggle = (page: Page) =>
  page.getByRole("button", { name: /, select persona$/ });

/** Waits until the prototype provider has canonicalized the URL. */
export const expectCanonicalProto = async (
  page: Page,
  persona: Persona,
  scenario: Scenario
) => {
  await expect
    .poll(() => [
      searchParam(page, "protoPersona"),
      searchParam(page, "protoScenario"),
    ])
    .toEqual([persona, scenario]);
};

// ── Tables and toolbars ──────────────────────────────────────────────────────

export const dataRows = (page: Page) =>
  page
    .getByRole("grid")
    .or(page.getByRole("table"))
    .first()
    .locator("tbody tr");

export const rowByText = (page: Page, text: string | RegExp) =>
  dataRows(page).filter({ hasText: text });

/** Row kebab: PF ActionsColumn ("Kebab toggle") or OverflowActionMenu ("Row actions"). */
export const rowActions = (row: Locator) =>
  row.getByRole("button", { name: /kebab toggle|row actions/i });

export const openRowActions = async (page: Page, text: string | RegExp) => {
  await rowActions(rowByText(page, text)).click();
};

/** Name filter of a FilterToolbar search input. */
export const filterByName = async (page: Page, text: string) => {
  await expect(dialog(page)).toHaveCount(0);
  const input = page.getByPlaceholder(/filter by name/i);
  await input.fill(text);
  await input.press("Enter");
  // The applied filter shows up as a chip in the toolbar.
  await expect(
    page.locator(".pf-v6-c-label-group").getByText(text, { exact: true })
  ).toBeVisible();
};

/** Picks a filter category and one of its select options. */
export const filterBy = async (page: Page, category: string, value: string) => {
  // The first "Name" button in the toolbar is the filter-category toggle.
  await page.getByRole("button", { name: "Name" }).first().click();
  await page.getByRole("menuitem", { name: category, exact: true }).click();
  await page.getByRole("combobox", { name: "Type to filter" }).click();
  await page.getByRole("menuitem", { name: value, exact: true }).click();
};

// ── Selects ──────────────────────────────────────────────────────────────────

/** Single-select typeahead (TypeaheadSelect): options are role=option. */
export const pickTypeahead = async (
  page: Page,
  toggleId: string,
  option: string | RegExp
) => {
  await page.locator(`#${toggleId}-input`).click();
  await page.getByRole("option", { name: option }).first().click();
};

/** Multi-select with checkboxes (MultiSelect): options are role=menuitem. */
export const pickMulti = async (
  page: Page,
  toggleId: string,
  options: (string | RegExp)[]
) => {
  await page.locator(`#${toggleId}-input`).click();
  for (const option of options)
    await page.getByRole("menuitem", { name: option }).first().click();
  // Close the menu by clicking the toggle (Escape would also close a modal).
  await page.locator(`#${toggleId}-input`).click();
};

/**
 * Picks an option in the open PatternFly menu. While a Modal is open PF marks
 * every other <body> child aria-hidden, which hides popper menus from the
 * accessibility tree, so options are found by text inside the visible menu.
 */
export const pickMenuOption = async (page: Page, name: string | RegExp) => {
  await page
    .locator(".pf-v6-c-menu:visible")
    .getByText(name, { exact: typeof name === "string" })
    .click();
};

// ── Application inventory ────────────────────────────────────────────────────

export const inventoryRow = (page: Page, applicationName: string) =>
  page.getByRole("row", { name: new RegExp(applicationName) });

export const migrationCell = (page: Page, applicationName: string) =>
  inventoryRow(page, applicationName).locator('td[data-label="Migration"]');

export const waitForInventory = async (page: Page) => {
  await expect(
    page.getByRole("heading", { name: "Application inventory" })
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Select row/ }).first()
  ).toBeVisible();
};

/** Migration activity overview counts, e.g. { Running: 3, Failed: 0, ... }. */
export const portfolioCounts = async (page: Page) => {
  const text = await main(page).innerText();
  const counts: Record<string, number> = {};
  for (const match of text.matchAll(
    /(Succeeded|Pending|Running|Failed|Action required): (\d+)/g
  ))
    counts[match[1]] = Number(match[2]);
  const review = text.match(/Review (\d+) request/i);
  if (review) counts["Action required"] = Number(review[1]);
  return counts;
};

/** Selects applications and opens the bulk "Run migration plan" preflight. */
export const openBulkRunMigration = async (
  page: Page,
  applicationNames: string[]
) => {
  for (const name of applicationNames)
    await inventoryRow(page, name).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Run migration plan" }).click();
  const preflight = dialog(page, "Run migration plan");
  await expect(preflight).toBeVisible();
  return preflight;
};

// ── Plan runs ────────────────────────────────────────────────────────────────

/** The Stages table of a plan run page. */
export const stagesTable = (page: Page) =>
  main(page).getByRole("grid", { name: "Stages", exact: true });

/** The links to the stage pages, in stage order. */
export const stageLinks = (page: Page) =>
  stagesTable(page).locator('a[href*="/stages/"]');

/** The status of a stage in the Stages table, by stage name. */
export const stageStatus = (page: Page, stage: string) =>
  stagesTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: stage, exact: true }) })
    .locator(AGENTIC_STATUS);

/** The decision button in the page's attention alert (not the confirm dialog's). */
export const approveButton = (page: Page) =>
  main(page).getByRole("button", { name: "Approve and continue", exact: true });

/** Approves from the attention alert: Approve always opens a confirm first (guide 4.3). */
export const approveStage = async (page: Page) => {
  await approveButton(page).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("This decision applies to");
  await confirm
    .getByRole("button", { name: "Approve and continue", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
};
