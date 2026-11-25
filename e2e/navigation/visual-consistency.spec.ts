/**
 * Layout regressions found by the final visual sweep: the same element must
 * look the same from row to row and from tab to tab, and table columns must
 * leave room for the name that leads each row. Checked at 1280 px with the
 * sidebar open, the narrowest desktop width with it,
 * and the plan runs list also at 1024 px (sidebar closed). Layout reads are
 * polled: fonts and rows can still settle on a loaded machine.
 */
import type { Page } from "@playwright/test";

import {
  dataRows,
  expect,
  main,
  mainHeading,
  protoUrl,
  rowByText,
  test,
} from "../support";

test.use({ viewport: { width: 1280, height: 900 } });

/** Header cells, or their sortable text, cut short by their column. */
const truncatedHeaders = (page: Page) =>
  page
    .locator("thead th, thead .pf-v6-c-table__text")
    .evaluateAll((cells) =>
      cells
        .filter((cell) => cell.scrollWidth > cell.clientWidth)
        .map((cell) => cell.textContent)
    );

// A width on a Th with an info button also applies to its text, which then
// truncates: the plans list sets the Target profiles width on its cells.
test("plans list: no header truncates", async ({ page }) => {
  await page.goto(protoUrl("/migration-plans"));
  await expect(mainHeading(page)).toHaveText("Migration plans");
  await expect(dataRows(page).first().getByRole("link").first()).toBeVisible();
  await expect.poll(() => truncatedHeaders(page)).toEqual([]);
});

for (const width of [1280, 1024]) {
  test.describe(`plan runs list at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("plan runs list: the run name keeps its room next to a long status", async ({
      page,
    }) => {
      await page.goto(protoUrl("/plan-runs"));
      await expect(mainHeading(page)).toHaveText("Plan runs");
      const row = rowByText(page, "Approval needed").first();
      await expect(row).toBeVisible();
      await expect
        .poll(() =>
          row
            .getByRole("link")
            .first()
            .evaluate((link) => {
              const lineHeight = parseFloat(getComputedStyle(link).lineHeight);
              return Math.round(
                link.getBoundingClientRect().height / lineHeight
              );
            })
        )
        .toBeLessThanOrEqual(2);
      await expect.poll(() => truncatedHeaders(page)).toEqual([]);
    });

    test("plan runs list: no header truncates when every status is short", async ({
      page,
    }) => {
      await page.goto(protoUrl("/plan-runs", { scenario: "failed" }));
      await expect(
        dataRows(page).first().getByRole("link").first()
      ).toBeVisible();
      await expect.poll(() => truncatedHeaders(page)).toEqual([]);
    });
  });
}

test("stage Transcript: View logs is the size of the note it ends", async ({
  page,
}) => {
  await page.goto(
    protoUrl("/plan-runs/1/stages/1", { params: { tab: "transcript" } })
  );
  const viewLogs = main(page)
    .getByRole("tabpanel")
    .getByRole("button", { name: "View logs" });
  await expect(viewLogs).toBeVisible();
  expect(
    await viewLogs.evaluate((button) => button.closest("small") != null)
  ).toBe(true);
  const [linkSize, noteSize] = await viewLogs.evaluate((button) => [
    getComputedStyle(button).fontSize,
    getComputedStyle(button.closest("small") as HTMLElement).fontSize,
  ]);
  expect(linkSize).toBe(noteSize);
});

test("application tabs offer Run migration plan before any run with the same link button", async ({
  page,
}) => {
  for (const tab of ["migration", "plan-runs"]) {
    await page.goto(protoUrl("/applications/1", { params: { tab } }));
    const run = main(page)
      .getByRole("tabpanel")
      .getByRole("button", { name: "Run migration plan" });
    await expect(run).toBeVisible();
    await expect(run).toHaveClass(/pf-m-link/);
  }
});

test("plan page: the empty Runs tab is the section heading and one sentence", async ({
  page,
}) => {
  // Plan 7 has never run.
  await page.goto(protoUrl("/migration-plans/7", { params: { tab: "runs" } }));
  const panel = main(page).getByRole("tabpanel");
  await expect(panel.getByRole("heading", { name: "Runs" })).toBeVisible();
  await expect(panel).toContainText(
    "Runs appear here when this plan runs on applications."
  );
  await expect(panel.getByRole("heading", { level: 3 })).toHaveCount(0);
});

test("skills list: the Usage summary wraps between counts and leaves the description its room", async ({
  page,
}) => {
  await page.goto(protoUrl("/skills"));
  await expect(mainHeading(page)).toHaveText("Skills");
  const summary = rowByText(page, "API compatibility checklist").getByRole(
    "link",
    { name: /agents?, .*collection/ }
  );
  await expect(summary).toBeVisible();
  // Each of the five counts is its own unbreakable span...
  await expect(summary.locator(".pf-v6-u-text-nowrap")).toHaveCount(5);
  // ...and stays on one line, even when the summary wraps.
  await expect
    .poll(() =>
      summary.evaluate(
        (link) =>
          Array.from(link.querySelectorAll("span span")).filter(
            (count) => count.getClientRects().length > 1
          ).length
      )
    )
    .toBe(0);
  // Before, the Usage text never wrapped and squeezed it to about 145 px.
  await expect
    .poll(() =>
      summary.evaluate((link) =>
        Math.round(
          (
            link.closest("tr")?.querySelectorAll("td")[1] as HTMLElement
          ).getBoundingClientRect().width
        )
      )
    )
    .toBeGreaterThan(220);
});

test("run dialog from one application speaks of that application", async ({
  page,
}) => {
  await page.goto(
    protoUrl("/applications/1", { params: { tab: "migration" } })
  );
  await main(page)
    .getByRole("tabpanel")
    .getByRole("button", { name: "Run migration plan" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Run migration plan" });
  await expect(dialog).toContainText(
    "Starts migrating Customer Management. It is checked before it starts."
  );
});
