/**
 * Keyboard use of table rows that hold a kebab, links or a drawer:
 * PatternFly's clickable row used to swallow Enter and Space for everything
 * inside it, so row menus did not open and links did not follow from the
 * keyboard. The row itself still opens the drawer with Enter and Space.
 */
import {
  dataRows,
  expect,
  mainHeading,
  protoUrl,
  rowActions,
  test,
} from "../support";

const menuKeys = [
  ["Enter", "Enter"],
  ["Space", "Space"],
] as const;

for (const [path, heading] of [
  ["/archetypes", "Archetypes"],
  ["/applications", "Application inventory"],
  ["/agents", "Agents"],
  ["/migration-plans", "Migration plans"],
] as const) {
  test.describe(`${heading} row menu from the keyboard`, () => {
    for (const [name, key] of menuKeys) {
      test(`${name} on the row kebab opens its menu and not the drawer`, async ({
        page,
      }) => {
        await page.goto(protoUrl(path));
        await expect(mainHeading(page)).toHaveText(heading);
        const kebab = rowActions(dataRows(page).first());
        await kebab.focus();
        await page.keyboard.press(key);
        await expect(kebab).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("menuitem").first()).toBeVisible();
        await expect(
          page.getByRole("button", { name: /close drawer/i })
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(kebab).toHaveAttribute("aria-expanded", "false");
      });
    }
  });
}

test("Enter on a link inside a row follows the link", async ({ page }) => {
  await page.goto(protoUrl("/applications"));
  await expect(mainHeading(page)).toHaveText("Application inventory");
  const link = dataRows(page).first().getByRole("link").first();
  const name = (await link.innerText()).trim();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(mainHeading(page)).toHaveText(name);
});

for (const [name, key] of menuKeys) {
  test(`${name} on a focused archetype row still opens its drawer`, async ({
    page,
  }) => {
    await page.goto(protoUrl("/archetypes"));
    await expect(mainHeading(page)).toHaveText("Archetypes");
    // An upstream Hub fixture archetype (not agentic mock data).
    const archetypeName = "Java EE Application";
    const row = page.getByRole("row", { name: new RegExp(archetypeName) });
    await row.focus();
    await page.keyboard.press(key);
    await expect(
      page.getByRole("heading", { name: archetypeName, level: 2 })
    ).toBeVisible();
  });
}
