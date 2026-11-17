/**
 * Static hosting (GitHub Pages): the prototype served as plain files, at the
 * root or under a base path (`/tackle2-ui/`), with `404.html` answering every
 * deep link. Runs against any base URL; tagged `@smoke` for the live
 * cross-browser smoke (see e2e/README.md).
 */
import type { Page } from "@playwright/test";

import {
  BASE_PATH,
  type Named,
  agenticRequest,
  expect,
  expectNoBrokenText,
  main,
  mainHeading,
  personaSelect,
  protoUrl,
  scenarioSelect,
  searchParam,
  stageSelect,
  switcher,
  test,
  withBase,
} from "../support";

const smoke = { tag: "@smoke" };

test(
  "a deep link with a query string opens that view in the persona, scenario and stage it names",
  smoke,
  async ({ page, pageErrors }) => {
    await page.goto(
      protoUrl("/plan-runs/1", {
        persona: "enterpriseArchitect",
        scenario: "actionRequired",
        stage: 1,
      })
    );
    await expect(mainHeading(page)).toHaveText(/^Run #1/);
    await expect(personaSelect(page)).toHaveValue("enterpriseArchitect");
    await expect(scenarioSelect(page)).toHaveValue("actionRequired");
    await expect(stageSelect(page)).toHaveValue("1");
    expect(new URL(page.url()).pathname).toBe(withBase("/plan-runs/1"));
    expect(searchParam(page, "protoStage")).toBe("1");
    expect(pageErrors).toEqual([]);
  }
);

test(
  "a path the host has no file for renders the app (404.html)",
  smoke,
  async ({ page, pageErrors }) => {
    // A static host answers with 404.html and status 404; dev servers with 200.
    const response = await page.goto(protoUrl("/skills/2?tab=associations"));
    expect(response?.status()).toBeLessThan(500);
    await expect(mainHeading(page)).toHaveText(
      "EJB to CDI conversion patterns"
    );
    await expect(
      page.getByRole("tab", { name: /^Associations/ })
    ).toHaveAttribute("aria-selected", "true");
    expect(pageErrors).toEqual([]);
  }
);

test("a reload resets the mock data", smoke, async ({ page }) => {
  const original = "EJB to CDI conversion patterns";
  const skillName = async () =>
    (await agenticRequest<Named>(page, "GET", "/skills/2")).body.name;
  await page.goto(protoUrl("/skills/2"));
  await expect(mainHeading(page)).toHaveText(original);
  const skill = (await agenticRequest<Named>(page, "GET", "/skills/2")).body;
  const renamed = await agenticRequest(page, "PUT", "/skills/2", {
    ...skill,
    name: "Renamed before reload",
  });
  expect(renamed.status).toBe(204);
  expect(await skillName()).toBe("Renamed before reload");
  await page.reload();
  await expect(mainHeading(page)).toHaveText(original);
  expect(await skillName()).toBe(original);
});

test(
  "a table filter keeps the base path in the URL and survives a reload",
  smoke,
  async ({ page }) => {
    await page.goto(protoUrl("/agents"));
    const nameFilter = page.getByRole("searchbox", {
      name: "Name filter",
      exact: true,
    });
    await nameFilter.fill("Code Migrator");
    await nameFilter.press("Enter");
    const rows = main(page).getByRole("link", {
      name: "Code Migrator",
      exact: true,
    });
    await expect(rows).toHaveCount(1);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === withBase("/agents") &&
        url.searchParams.has("agents:filters") &&
        url.searchParams.get("protoPersona") === "enterpriseArchitect"
    );
    await page.reload();
    await expect(rows).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe(withBase("/agents"));
  }
);

test(
  "every request stays under the base path or /hub, and strings are translated",
  smoke,
  async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const outside: string[] = [];
    const locales: Promise<number>[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (
        url.origin !== origin ||
        !(url.pathname.startsWith(BASE_PATH) || url.pathname.startsWith("/hub"))
      )
        outside.push(request.url());
      if (url.pathname.includes("/locales/"))
        locales.push(
          request.response().then((response) => response?.status() ?? 0)
        );
    });
    await page.goto(protoUrl("/applications"));
    await expect(mainHeading(page)).toHaveText("Application inventory");
    await expect(
      switcher(page).getByRole("combobox", { name: "Persona" })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoBrokenText(main(page));
    await expectNoBrokenText(switcher(page));
    // The translations may come from the HTTP cache; when fetched, they load.
    for (const status of await Promise.all(locales))
      expect([200, 304]).toContain(status);
    expect(outside).toEqual([]);
  }
);

test(
  "the mock service worker is scoped to the base path",
  smoke,
  async ({ page }) => {
    await page.goto(protoUrl("/applications"));
    await expect(mainHeading(page)).toHaveText("Application inventory");
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.scope
    );
    expect(scope).toBe(new URL(BASE_PATH, page.url()).href);
  }
);

test.describe("template downloads resolve under the base path", () => {
  const expectServedUnderBase = async (page: Page, href: string) => {
    expect(new URL(href).pathname.startsWith(BASE_PATH)).toBe(true);
    const response = await page.request.get(href);
    expect(response.ok(), href).toBe(true);
    expect((await response.text()).trimStart()).not.toMatch(/^<!DOCTYPE/i);
  };

  test("application import CSV template", smoke, async ({ page }) => {
    await page.goto(
      protoUrl("/applications/application-imports", {
        persona: "platformEngineer",
      })
    );
    await page
      .getByRole("button", { name: "Table toolbar actions kebab toggle" })
      .click();
    const link = page.locator(
      'a[download][href$="template_application_import.csv"]'
    );
    await expect(link).toBeVisible();
    await expectServedUnderBase(
      page,
      await link.evaluate((a) => (a as HTMLAnchorElement).href)
    );
  });

  test("questionnaire YAML template", smoke, async ({ page }) => {
    await page.goto(protoUrl("/assessment", { persona: "platformEngineer" }));
    const link = page.locator("#download-yaml-template");
    await expect(link).toBeVisible();
    await expectServedUnderBase(
      page,
      await link.evaluate((a) => (a as HTMLAnchorElement).href)
    );
  });
});

test(
  "the visitor guide loads and its links open the prototype",
  smoke,
  async ({ page }) => {
    const response = await page.goto("prototype-guide/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toBeVisible();
    const links = await page
      .getByRole("main")
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: (a as HTMLAnchorElement).href,
        }))
      );
    const guide = new URL(page.url());
    const appLinks = links.filter(
      (link) =>
        new URL(link.href).origin === guide.origin &&
        new URL(link.href).pathname !== guide.pathname
    );
    expect(appLinks.length).toBeGreaterThan(3);
    for (const link of appLinks) {
      await test.step(`${link.text} -> ${link.href}`, async () => {
        expect(new URL(link.href).pathname.startsWith(BASE_PATH)).toBe(true);
        await page.goto(link.href);
        await expect(mainHeading(page)).toBeVisible();
        await expect(switcher(page)).toBeVisible();
      });
    }
    // The switcher links back to the guide, in a new tab so this tab keeps
    // its in-memory mock data.
    const guideLink = switcher(page).getByRole("link", {
      name: "How to use this preview",
    });
    await expect(guideLink).toHaveAttribute("target", "_blank");
    const [guideTab] = await Promise.all([
      page.context().waitForEvent("page"),
      guideLink.click(),
    ]);
    await expect(guideTab).toHaveURL(guide.href);
    await guideTab.close();
  }
);
