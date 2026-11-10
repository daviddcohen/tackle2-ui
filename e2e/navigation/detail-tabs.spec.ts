/**
 * Entity detail pages: the inventory opens a full application page (it
 * replaced upstream's drawer), tabs are URL-backed (`?tab=`) and an unknown
 * tab value falls back to the first tab.
 */
import {
  breadcrumb,
  expect,
  main,
  mainHeading,
  protoUrl,
  test,
} from "../support";

test("an application name in the inventory opens its detail page, and the crumb returns", async ({
  page,
}) => {
  await page.goto(protoUrl("/applications"));
  const link = main(page).getByRole("link", {
    name: "Customer Management",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", /^\/applications\/\d+/);
  await link.click();
  await expect(page).toHaveURL(/\/applications\/\d+/);
  await expect(mainHeading(page)).toHaveText("Customer Management");
  await expect(page.locator(".pf-v6-c-drawer.pf-m-expanded")).toHaveCount(0);
  for (const tab of ["Details", "Migration", "Plan runs", "Skills"])
    await expect(
      page.getByRole("tab", { name: tab, exact: true })
    ).toBeVisible();

  await page.getByRole("tab", { name: "Plan runs", exact: true }).click();
  await expect(page).toHaveURL(/tab=plan-runs/);
  await breadcrumb(page)
    .getByRole("link", { name: "Application inventory", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications(\?|$)/);
});

test("the selected tab controls an existing panel", async ({ page }) => {
  await page.goto(protoUrl("/applications/1?tab=migration"));
  const tab = page.getByRole("tab", { name: "Migration", selected: true });
  const panelId = await tab.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(
    page.locator(`[id="${panelId}"][role="tabpanel"]`)
  ).toBeVisible();
});

for (const [path, firstTab] of [
  ["/agents/3", "Details"],
  ["/migration-plans/1", "Overview"],
  ["/applications/1", "Details"],
  ["/skills/1", "Details"],
] as const) {
  test(`${path}?tab=bogus falls back to the ${firstTab} tab`, async ({
    page,
  }) => {
    await page.goto(protoUrl(`${path}?tab=bogus`));
    await expect(
      page.getByRole("tab", { name: firstTab, exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
    await expect(main(page).getByRole("tabpanel")).toBeVisible();
  });
}
