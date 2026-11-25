/**
 * Run observability on the stage page (the agent run page): the Details,
 * Transcript, Logs and YAML tabs, how they refresh while the stage runs and
 * stop once it finished, the context window fact, the header and the
 * attention alert on each tab.
 *
 * Mock timings (client/src/mocks/stub-new-work/agentic/observability.ts):
 * a running stage gets a new transcript step about every 5 s and a log line
 * about every second for 2.5 minutes after the world is seeded (every
 * `page.goto`); the transcript and logs poll every 3 s while it runs.
 * Assertions on growth wait up to 20 s: several poll cycles.
 *
 * Stages used (run 1 = Java EE to Quarkus):
 * - running, protoStage 2: stage 2 (Migrate) is Running and recorded;
 * - configured: stage 1 requires approval (transcript skipped), stage 2 has
 *   the very long saved log and an incomplete transcript with a gap, stage 3
 *   has a complete transcript;
 * - configured, run 2 stage 5: Pending.
 */
import type { Locator, Page } from "@playwright/test";

import {
  type Scenario,
  breadcrumb,
  expect,
  fixtureGraph,
  main,
  protoUrl,
  test,
} from "../support";

/** Growth arrives with the next polls (3 s) of a step (5 s) or line (1 s). */
const GROWTH_TIMEOUT = 20_000;

const STAGE_TABS = ["Details", "Transcript", "Logs", "YAML"] as const;

const stageUrl = (
  runId: string,
  stageId: string,
  scenario: Scenario,
  options: { stage?: number; tab?: string } = {}
) =>
  protoUrl(`/plan-runs/${runId}/stages/${stageId}`, {
    scenario,
    stage: options.stage,
    params: options.tab != null ? { tab: options.tab } : undefined,
  });

const RUNNING_STAGE = ["1", "2", "running", { stage: 2 }] as const;

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

const tabPanel = (page: Page) => main(page).getByRole("tabpanel");

/** The "Agent run" section of Details; the context window is its last fact. */
const agentRunFacts = (page: Page) =>
  main(page)
    .locator("div")
    .filter({
      has: page.getByRole("heading", { level: 2, name: "Agent run" }),
    })
    .filter({ has: page.getByRole("term") })
    .last();

/** An inline alert's title, which PatternFly names "{Variant} alert: {title}". */
const alertTitle = (scope: Locator, variant: string, title?: RegExp) =>
  scope.getByRole("heading", {
    name: new RegExp(`^${variant} alert: ${title?.source ?? ""}`),
  });

/** The chat: a scrolling region of messages. */
const transcript = (page: Page) =>
  main(page).getByRole("region", { name: "Transcript", exact: true });

/** The messages (one per turn), named by who sent them and when. */
const transcriptMessages = (page: Page) =>
  transcript(page).getByRole("region", { name: /^Message from / });

/** What a turn holds (prose, cards, the plan), and the dividers between. */
const transcriptEntries = (page: Page) =>
  transcript(page).locator(
    ".pf-chatbot__message-and-actions > *, .pf-chatbot__message-divider"
  );

/** The tool call card whose toggle has this name. */
const toolCard = (page: Page, name: RegExp) =>
  transcript(page)
    .locator(".pf-chatbot__tool-response")
    .filter({ has: page.getByRole("button", { name }) })
    .first();

/** Distance (px) between the bottom of the chat and its latest entry. */
const transcriptToBottom = (page: Page) =>
  transcript(page).evaluate(
    (box) => box.scrollHeight - box.scrollTop - box.clientHeight
  );

const logRegion = (page: Page) =>
  main(page).getByRole("region", { name: / log$/ });

const logScroller = (page: Page) =>
  logRegion(page).locator(".pf-v6-c-log-viewer__scroll-container");

const containerToggle = (page: Page) =>
  logRegion(page).getByRole("button", { name: /^Container: / });

/** The scroll position of the log and the line numbers in view. */
interface LogView {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Line number of the first line fully in view. */
  firstLine: number;
  /** Line number of the last line in view. */
  lastLine: number;
  /** Distance (px) between the bottom of the view and the end of the log. */
  toBottom: number;
}

const logView = (page: Page): Promise<LogView> =>
  logScroller(page).evaluate((scroller) => {
    const box = scroller.getBoundingClientRect();
    const numbers = [
      ...scroller.querySelectorAll<HTMLElement>(
        ".pf-v6-c-log-viewer__list-item"
      ),
    ]
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1;
      })
      .map((item) =>
        Number(
          item.querySelector(".pf-v6-c-log-viewer__index")?.textContent ?? NaN
        )
      )
      .filter((value) => !Number.isNaN(value));
    return {
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      firstLine: numbers.length > 0 ? Math.min(...numbers) : 0,
      lastLine: numbers.length > 0 ? Math.max(...numbers) : 0,
      toBottom:
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
    };
  });

/** The view is at the end of the log (allowing the list's bottom padding). */
const AT_END_PX = 40;

const lineTexts = (scope: Locator) =>
  scope.locator(".pf-v6-c-log-viewer__text").allInnerTexts();

/** "Updated just now." / "Updated 3 seconds ago." */
const UPDATED_AGO = /Updated (just now|\d+ seconds? ago)\./;

test.describe("Stage tabs", () => {
  test("the stage page has Details, Transcript, Logs and YAML tabs, Details first", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured"));
    await expect(main(page).getByRole("tablist").getByRole("tab")).toHaveText([
      ...STAGE_TABS,
    ]);
    await expect(tab(page, "Details")).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("term").filter({ hasText: "Agent" })
    ).toBeVisible();
  });

  for (const [key, name] of [
    ["details", "Details"],
    ["transcript", "Transcript"],
    ["logs", "Logs"],
    ["yaml", "YAML"],
  ] as const) {
    test(`?tab=${key} opens the ${name} tab`, async ({ page }) => {
      await page.goto(stageUrl("1", "3", "configured", { tab: key }));
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      // Only the open tab is mounted.
      await expect(tabPanel(page)).toHaveCount(1);
      const shown = {
        details: page.getByRole("term").filter({ hasText: "Pod" }),
        transcript: transcript(page),
        logs: logRegion(page),
        yaml: main(page).getByRole("group", { name: "Format" }),
      }[key];
      await expect(shown).toBeVisible();
    });
  }

  test("an unknown tab falls back to Details", async ({ page }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "nonsense" }));
    await expect(tab(page, "Details")).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("term").filter({ hasText: "Pod" })
    ).toBeVisible();
  });

  test("clicking a tab puts it in the URL, so a reload keeps it", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured"));
    await tab(page, "Logs").click();
    await expect(page).toHaveURL(/[?&]tab=logs\b/);
    await expect(logRegion(page)).toBeVisible();
    await tab(page, "YAML").click();
    await expect(page).toHaveURL(/[?&]tab=yaml\b/);
    await page.reload();
    await expect(tab(page, "YAML")).toHaveAttribute("aria-selected", "true");
  });

  test("the tabs are reachable and selectable with the keyboard", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured"));
    await tab(page, "Details").focus();
    await page.keyboard.press("Tab");
    await expect(tab(page, "Transcript")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tab(page, "Transcript")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page).toHaveURL(/[?&]tab=transcript\b/);
    await page.keyboard.press("Tab");
    await expect(tab(page, "Logs")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
  });

  // Known defect: PatternFly 6.7 Tabs render role="tablist"/"tab" but have
  // no arrow key handling, so the WAI-ARIA tabs pattern (Left/Right move
  // between tabs) does not work here or on any other tabbed page.
  test("arrow keys move between the tabs", async ({ page }) => {
    test.fail(true, "PatternFly Tabs have no arrow key navigation");
    await page.goto(stageUrl("1", "3", "configured"));
    await tab(page, "Details").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Transcript")).toBeFocused({ timeout: 2_000 });
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "Details")).toBeFocused({ timeout: 2_000 });
  });

  test("a pending stage has every tab, each saying it appears when the stage starts", async ({
    page,
  }) => {
    const reads: string[] = [];
    page.on("request", (request) => {
      if (/\/agentic\/agent-runs\//.test(request.url()))
        reads.push(request.url());
    });
    // Run 2, stage 5 (Migrate) waits for Analyze to be approved.
    await page.goto(stageUrl("2", "5", "configured"));
    await expect(main(page).getByRole("tablist").getByRole("tab")).toHaveText([
      ...STAGE_TABS,
    ]);
    // No agent run, so no context window, before the stage starts.
    await expect(main(page).getByText("Context window")).toHaveCount(0);
    for (const [name, message] of [
      ["Transcript", "The transcript appears when this stage starts."],
      ["Logs", "The logs appear when this stage starts."],
      ["YAML", "The YAML appears when this stage starts."],
    ] as const) {
      await tab(page, name).click();
      await expect(tabPanel(page)).toContainText(message);
    }
    await tab(page, "Details").click();
    await expect(
      page.getByRole("definition").filter({ hasText: "Not started" })
    ).toHaveCount(1);
    // A stage without an agent run reads no transcript, log or resource.
    expect(reads).toEqual([]);
  });

  test("a stage its failed run never reached says on every tab that the agent did not start", async ({
    page,
  }) => {
    // Run 4 failed at Assess packaging, so stage 8 never started.
    await page.goto(stageUrl("4", "8", "configured"));
    await expect(tabPanel(page)).toContainText(
      "This stage did not run because Assess packaging failed."
    );
    for (const name of ["Transcript", "Logs", "YAML"]) {
      await tab(page, name).click();
      await expect(tabPanel(page)).toContainText(
        "The agent did not start for this stage."
      );
      await expect(tabPanel(page)).not.toContainText("when this stage starts");
    }
  });
});

test.describe("Auto-refresh while the stage runs", () => {
  test("the transcript gains entries without a reload and says when it was updated", async ({
    page,
  }) => {
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(
      stageUrl(runId, stageId, scenario, { ...options, tab: "transcript" })
    );
    await expect(transcript(page)).toBeVisible();
    await expect(tabPanel(page)).toContainText(
      "Recording while the agent runs."
    );
    await expect(tabPanel(page)).toContainText(UPDATED_AGO);
    const before = await transcriptEntries(page).count();
    await expect
      .poll(() => transcriptEntries(page).count(), {
        timeout: GROWTH_TIMEOUT,
      })
      .toBeGreaterThan(before);
  });

  test("the log gains lines without a reload while following its end", async ({
    page,
  }) => {
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(
      stageUrl(runId, stageId, scenario, { ...options, tab: "logs" })
    );
    await expect(logRegion(page)).toContainText(/Live from pod \S+\./);
    await expect(logRegion(page)).toContainText(UPDATED_AGO);
    await expect(
      logRegion(page).locator(".pf-v6-c-log-viewer__index").first()
    ).toBeVisible();
    const before = (await logView(page)).lastLine;
    await expect
      .poll(async () => (await logView(page)).lastLine, {
        timeout: GROWTH_TIMEOUT,
      })
      .toBeGreaterThan(before);
    // Following: the newest line is the last one in view.
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);
  });

  test("the Details tab says it refreshes while the stage runs", async ({
    page,
  }) => {
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(stageUrl(runId, stageId, scenario, options));
    await expect(tabPanel(page)).toContainText(
      "Refreshes while the agent runs."
    );
    await expect(tabPanel(page)).toContainText(UPDATED_AGO);
  });
});

test.describe("Refresh stops on a finished stage", () => {
  /** GETs of the observability endpoints, recorded from now on. */
  const recordObservability = (page: Page) => {
    const urls: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        /\/hub\/prototype\/agentic\/(plan-runs\/[^/]+\/)?agent-runs\b/.test(
          request.url()
        )
      )
        urls.push(request.url());
    });
    return urls;
  };

  /** Lets fetches started by fired timers reach the network layer. */
  const flush = (page: Page) =>
    page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));

  /** Advances the fake clock one second at a time. */
  const advance = async (page: Page, seconds: number) => {
    for (let second = 0; second < seconds; second++) {
      await page.clock.runFor(1_000);
      await flush(page);
    }
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test("a running stage's transcript polls (control for the checks below)", async ({
    page,
  }) => {
    const urls = recordObservability(page);
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(
      stageUrl(runId, stageId, scenario, { ...options, tab: "transcript" })
    );
    await expect(transcript(page)).toBeVisible();
    const transcriptReads = () =>
      urls.filter((url) => url.includes("/transcript")).length;
    const before = transcriptReads();
    await expect
      .poll(async () => {
        await advance(page, 1);
        return transcriptReads() - before;
      })
      .toBeGreaterThanOrEqual(2);
  });

  for (const [name, key, content] of [
    ["transcript", "transcript", (page: Page) => transcript(page)],
    ["log", "logs", (page: Page) => logRegion(page)],
  ] as const) {
    test(`a finished stage's ${name} is read once and not polled`, async ({
      page,
    }) => {
      const urls = recordObservability(page);
      // Run 1, stage 3 (Validate) succeeded: complete transcript, saved log.
      await page.goto(stageUrl("1", "3", "configured", { tab: key }));
      await expect(content(page)).toBeVisible();
      if (key === "logs") {
        await expect(logRegion(page)).toContainText(
          "Saved log. The pod no longer exists."
        );
        await expect(
          logRegion(page).getByRole("button", { name: /following/ })
        ).toHaveCount(0);
      } else {
        // A complete recording needs no sentence above the chat.
        await expect(transcript(page)).toBeVisible();
        await expect(tabPanel(page)).not.toContainText("was recorded");
      }
      await expect
        .poll(() =>
          urls.some((url) =>
            key === "logs"
              ? url.includes("/logs?")
              : url.includes("/transcript")
          )
        )
        .toBe(true);
      // Let the final fetches settle before counting.
      await advance(page, 1);
      const text = await content(page).innerText();
      const settled = urls.length;
      await advance(page, 30);
      expect(urls.slice(settled), "observability requests").toEqual([]);
      expect(await content(page).innerText()).toBe(text);
    });
  }
});

test.describe("Transcript while recording", () => {
  test("opens at the latest entry, lets go when the reader scrolls up, and Back to latest follows again", async ({
    page,
  }) => {
    // Jump the page's clock (the mock reads it too) so the chat overflows,
    // as the Logs test does. Time keeps flowing from there.
    await page.clock.install();
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(
      stageUrl(runId, stageId, scenario, { ...options, tab: "transcript" })
    );
    await expect(transcriptMessages(page).first()).toBeVisible();
    await page.clock.fastForward(60_000);
    await expect
      .poll(
        () =>
          transcript(page).evaluate(
            (box) => box.scrollHeight - box.clientHeight
          ),
        { timeout: GROWTH_TIMEOUT }
      )
      .toBeGreaterThan(300);
    // Following: at the latest entry.
    await expect.poll(() => transcriptToBottom(page)).toBeLessThan(5);

    await transcript(page).hover();
    await page.mouse.wheel(0, -300);
    await expect.poll(() => transcriptToBottom(page)).toBeGreaterThan(100);
    const place = await transcript(page).evaluate((box) => box.scrollTop);
    const count = await transcriptEntries(page).count();
    // New entries arrive below; the reader's place stays.
    await expect
      .poll(() => transcriptEntries(page).count(), {
        timeout: GROWTH_TIMEOUT,
      })
      .toBeGreaterThan(count);
    expect(await transcript(page).evaluate((box) => box.scrollTop)).toBe(place);

    await main(page).getByRole("button", { name: "Back to latest" }).click();
    await expect.poll(() => transcriptToBottom(page)).toBeLessThan(5);
    const followed = await transcriptEntries(page).count();
    await expect
      .poll(() => transcriptEntries(page).count(), {
        timeout: GROWTH_TIMEOUT,
      })
      .toBeGreaterThan(followed);
    await expect.poll(() => transcriptToBottom(page)).toBeLessThan(5);
  });
});

test.describe("Logs", () => {
  test("scrolling up pauses following, keeps the place, and Resume jumps to the end", async ({
    page,
  }) => {
    // A freshly seeded stage needs about 40 s of lines to overflow the
    // view: jump the page's clock (the mock reads it too) instead of
    // waiting. Time keeps flowing from there.
    await page.clock.install();
    const [runId, stageId, scenario, options] = RUNNING_STAGE;
    await page.goto(
      stageUrl(runId, stageId, scenario, { ...options, tab: "logs" })
    );
    const pause = logRegion(page).getByRole("button", {
      name: "Pause following",
    });
    const resume = logRegion(page).getByRole("button", {
      name: "Resume following",
    });
    await expect(pause).toBeVisible();
    await expect(
      logRegion(page).locator(".pf-v6-c-log-viewer__index").first()
    ).toBeVisible();
    await page.clock.fastForward(60_000);
    // Enough lines to scroll.
    await expect
      .poll(
        async () => {
          const view = await logView(page);
          return view.scrollHeight - view.clientHeight;
        },
        { timeout: GROWTH_TIMEOUT }
      )
      .toBeGreaterThan(200);
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);

    await logScroller(page).hover();
    await page.mouse.wheel(0, -150);
    await expect(resume).toBeVisible();
    await expect(logRegion(page)).toContainText("Following paused.");

    const paused = await logView(page);
    expect(paused.toBottom).toBeGreaterThan(AT_END_PX);
    // New lines arrive, the reader's place stays.
    await expect
      .poll(async () => (await logView(page)).scrollHeight, {
        timeout: GROWTH_TIMEOUT,
      })
      .toBeGreaterThan(paused.scrollHeight);
    const later = await logView(page);
    expect(later.scrollTop).toBe(paused.scrollTop);
    expect(later.firstLine).toBe(paused.firstLine);

    await resume.click();
    await expect(pause).toBeVisible();
    await expect(logRegion(page)).not.toContainText("Following paused.");
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);
    expect((await logView(page)).lastLine).toBeGreaterThan(paused.lastLine);
  });

  test("a saved log opens at its last line", async ({ page }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "logs" }));
    await expect(logRegion(page)).toContainText("Validate succeeded");
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);
  });

  test("the log can be reached with Tab and scrolled with the keyboard", async ({
    page,
  }) => {
    // Run 1, stage 2 (Migrate): a very long saved log, opened at its end.
    await page.goto(stageUrl("1", "2", "configured", { tab: "logs" }));
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);
    const download = logRegion(page).getByRole("button", { name: "Download" });
    await download.focus();
    await page.keyboard.press("Tab");
    await expect(logScroller(page)).toBeFocused();
    const before = (await logView(page)).scrollTop;
    await page.keyboard.press("PageUp");
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await logView(page)).scrollTop)
      .toBeLessThan(before);
  });

  test("the container select switches to Skill loader and All containers", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "logs" }));
    await expect(containerToggle(page)).toHaveAccessibleName(
      "Container: Agent"
    );
    await expect(
      main(page).getByRole("region", { name: "Agent log" })
    ).toBeVisible();

    await containerToggle(page).click();
    // The name matches the YAML; the help says what it does.
    await expect(
      page.getByRole("option", { name: /^Skill loader/ })
    ).toContainText("Loads this stage's skills before the agent starts");
    await page.getByRole("option", { name: /^Skill loader/ }).click();
    await expect(containerToggle(page)).toHaveAccessibleName(
      "Container: Skill loader"
    );
    const skillLoader = main(page).getByRole("region", {
      name: "Skill loader log",
    });
    await expect(skillLoader).toBeVisible();
    await expect(
      skillLoader.locator(".pf-v6-c-log-viewer__text").first()
    ).toBeVisible();
    const skillLoaderLines = await lineTexts(skillLoader);
    expect(skillLoaderLines.join("\n")).not.toMatch(/^\[/m);

    await containerToggle(page).click();
    await page.getByRole("option", { name: /^All containers/ }).click();
    await expect(containerToggle(page)).toHaveAccessibleName(
      "Container: All containers"
    );
    const all = main(page).getByRole("region", { name: "All containers log" });
    await expect(all).toBeVisible();
    // A saved log opens at its end: the agent's lines, prefixed.
    await expect
      .poll(async () => (await lineTexts(all)).join("\n"))
      .toMatch(/^\[agent\] /m);
    // The skill loader's lines come first.
    await logScroller(page).evaluate((scroller) => {
      scroller.scrollTop = 0;
    });
    await expect
      .poll(async () => (await lineTexts(all))[0] ?? "")
      .toMatch(/^\[skill-loader\] /);
  });

  test("search finds and steps through matches in the very long saved log", async ({
    page,
  }) => {
    // Run 1, stage 2 (Migrate): 24,000+ lines of saved agent log.
    await page.goto(stageUrl("1", "2", "configured", { tab: "logs" }));
    await expect
      .poll(async () => (await logView(page)).lastLine)
      .toBeGreaterThan(20_000);
    const search = logRegion(page).getByRole("textbox", {
      name: "Search logs",
    });
    await search.fill("tool: completed");
    const count = logRegion(page).locator(".pf-v6-c-badge");
    await expect(count).toHaveText(/^1 \/ \d+/);
    const total = Number((await count.innerText()).match(/\/ (\d+)/)?.[1]);
    expect(total).toBeGreaterThan(2);
    // The first match is in view, far from the end the log opened at.
    const first = await logView(page);
    expect(first.lastLine).toBeLessThan(20_000);
    expect((await lineTexts(logRegion(page))).join("\n")).toContain(
      "tool: completed"
    );

    await logRegion(page).getByRole("button", { name: "Next" }).click();
    await expect(count).toHaveText(new RegExp(`^2 / ${total}`));
    await logRegion(page).getByRole("button", { name: "Previous" }).click();
    await expect(count).toHaveText(new RegExp(`^1 / ${total}`));
    // Previous from the first match goes to the last one, near the end.
    await logRegion(page).getByRole("button", { name: "Previous" }).click();
    await expect(count).toHaveText(new RegExp(`^${total} / ${total}`));
    await expect
      .poll(async () => (await logView(page)).lastLine)
      .toBeGreaterThan(20_000);
    expect((await lineTexts(logRegion(page))).join("\n")).toContain(
      "tool: completed"
    );
  });

  test("Download saves {agent run}-{container}.log with the log text", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "logs" }));
    await expect(logRegion(page)).toContainText("Validate succeeded");
    await expect
      .poll(async () => (await logView(page)).toBottom)
      .toBeLessThanOrEqual(AT_END_PX);
    const { lastLine } = await logView(page);
    const visible = await lineTexts(logRegion(page));

    const downloading = page.waitForEvent("download");
    await logRegion(page).getByRole("button", { name: "Download" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("run-1-validate-agent.log");
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    const lines = text.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(lastLine);
    // The saved text is the log as shown (the viewer renders ANSI colors).
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const plain = (line: string) =>
      line.replace(ansi, "").replace(/\s+/g, " ").trim();
    expect(lines.slice(-visible.length).map(plain)).toEqual(visible.map(plain));

    await containerToggle(page).click();
    await page.getByRole("option", { name: /^Skill loader/ }).click();
    await expect(
      main(page).getByRole("region", { name: "Skill loader log" })
    ).toBeVisible();
    const second = page.waitForEvent("download");
    await logRegion(page).getByRole("button", { name: "Download" }).click();
    expect((await second).suggestedFilename()).toBe(
      "run-1-validate-skill-loader.log"
    );
  });
});

test.describe("Transcript", () => {
  test("a tool call card expands and collapses from the keyboard and shows its output", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "transcript" }));
    await expect(transcript(page)).toBeVisible();
    // A tool call's toggle reads its kind, title and status.
    const name = /shell · mvn .*Completed$/;
    const card = toolCard(page, name);
    const toggle = card.getByRole("button", { name });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const output = card.locator(".pf-v6-c-code-block");
    await expect(output).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(output).toBeVisible();
    await expect(output).toContainText("BUILD SUCCESS");

    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(output).toBeHidden();
  });

  test("the transcript reads as a chat: named agent messages in Markdown, tool cards with their output", async ({
    page,
  }) => {
    // Run 1, stage 2 (Migrate) succeeded with commits: it ends with a check
    // that lists the changes and a Markdown summary.
    await page.goto(stageUrl("1", "2", "configured", { tab: "transcript" }));
    const first = transcriptMessages(page).first();
    await expect(first).toHaveAccessibleName(
      /^Message from .+ at .*\d{1,2}:\d{2}:\d{2}.* \(UTC \d{2}:\d{2}:\d{2}\)$/
    );
    await expect(first.getByText("AI", { exact: true })).toBeVisible();

    // The closing summary: emphasis, a nested list, inline code.
    const summary = transcriptMessages(page).filter({
      hasText: "Final check passed:",
    });
    await expect(summary.locator("em")).toHaveText("Final check passed:");
    await expect(summary.locator("ul ul li")).toHaveCount(2);
    await expect(summary.locator("code").first()).toHaveText(
      "mvn -q -DskipTests package"
    );

    // The check's output, several lines, monospace, with a copy button.
    const checkName = /git status --short && git diff --stat/;
    const card = toolCard(page, checkName);
    await card.getByRole("button", { name: checkName }).click();
    const output = card.getByRole("region", { name: "Output" });
    await expect(output).toBeVisible();
    expect((await output.innerText()).split("\n").length).toBe(5);
    await expect(
      card.getByRole("button", { name: "Copy output" })
    ).toBeVisible();
    expect(
      await output.evaluate((code) => getComputedStyle(code).fontFamily)
    ).toMatch(/mono/i);

    // Notices divide the conversation.
    await expect(
      transcript(page).locator(".pf-chatbot__message-divider")
    ).toContainText(["Stage succeeded: results pushed to"]);
  });

  test("a stage without commits ends with a clean check that says nothing changed", async ({
    page,
  }) => {
    // Run 1, stage 3 (Validate): its plan says 0 commits.
    await page.goto(stageUrl("1", "3", "configured", { tab: "transcript" }));
    await expect(transcriptMessages(page).first()).toHaveAccessibleName(
      /^Message from Build Validator at /
    );
    const checkName = /git status --short && git diff --stat/;
    const card = toolCard(page, checkName);
    await card.getByRole("button", { name: checkName }).click();
    await expect(card).toContainText("No output.");
    await expect(
      transcriptMessages(page).filter({ hasText: "Final check passed:" })
    ).toContainText("The working tree is clean");
  });

  test("a failed tool call opens with its output", async ({ page }) => {
    // Run 1, stage 2 (Migrate): some builds failed on the way.
    await page.goto(stageUrl("1", "2", "configured", { tab: "transcript" }));
    const name = /shell · mvn .*Failed$/;
    const card = toolCard(page, name);
    await expect(card.getByRole("button", { name })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(card.locator("pre")).toContainText("COMPILATION ERROR");
  });

  test("the chat fills the page and scrolls inside, with jump buttons", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "transcript" }));
    await expect(transcriptMessages(page).first()).toBeVisible();
    const box = await transcript(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    // It reaches the bottom of the page (less the section padding).
    expect(viewport!.height - (box!.y + box!.height)).toBeLessThan(40);
    expect(
      await transcript(page).evaluate(
        (element) => element.scrollHeight > element.clientHeight
      )
    ).toBe(true);
    // A finished transcript opens at its start.
    expect(
      await transcript(page).evaluate((element) => element.scrollTop)
    ).toBe(0);
    await main(page).getByRole("button", { name: "Back to latest" }).click();
    await expect.poll(() => transcriptToBottom(page)).toBeLessThan(5);
    await main(page).getByRole("button", { name: "Back to top" }).click();
    await expect
      .poll(() => transcript(page).evaluate((element) => element.scrollTop))
      .toBe(0);
  });

  test("at a narrow width the chat keeps to the screen", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto(stageUrl("1", "3", "configured", { tab: "transcript" }));
    await expect(transcriptMessages(page).first()).toBeVisible();
    expect(
      await transcript(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true);
    // A tool title keeps a line of its own.
    const title = transcript(page)
      .locator(".pf-chatbot__tool-response .pf-v6-u-text-truncate")
      .first();
    expect((await title.boundingBox())!.width).toBeGreaterThan(100);
    // The agent's name shows whole: the time wraps under it instead.
    await page.goto(stageUrl("1", "2", "configured", { tab: "transcript" }));
    const name = transcriptMessages(page)
      .first()
      .locator(".pf-chatbot__message-name .pf-v6-c-truncate");
    await expect(name).toHaveText("Java Code Migrator");
    expect(
      await name.evaluate(
        (element) => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true);
  });

  test("a stage that requires approval shows its live messages and View logs opens the Logs tab", async ({
    page,
  }) => {
    // Run 1, stage 1 (Prepare proposal) runs in approve mode: not recorded,
    // so the tab shows the agent's messages from the live session.
    await page.goto(stageUrl("1", "1", "configured", { tab: "transcript" }));
    await expect(tabPanel(page)).toContainText(
      "Stages that require approval are not recorded. These are the agent's messages from the live session."
    );
    await expect(
      transcript(page).getByText(/Starting "Prepare proposal"/)
    ).toBeVisible();
    await tabPanel(page).getByRole("button", { name: "View logs" }).click();
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]tab=logs\b/);
    await expect(logRegion(page)).toBeVisible();
  });

  test("an incomplete transcript says so and shows the gap", async ({
    page,
  }) => {
    // Run 1, stage 2 (Migrate): recording was interrupted once.
    await page.goto(stageUrl("1", "2", "configured", { tab: "transcript" }));
    await expect(tabPanel(page)).toContainText(
      "Parts of this transcript were not recorded."
    );
    const gap = transcript(page)
      .locator(".pf-chatbot__message-divider")
      .filter({ hasText: /^Recording interrupted for \d+m( \d+s)?$/ });
    await expect(gap).toHaveCount(1);
    // The gap sits between recorded entries, not at an end.
    const entries = await transcriptEntries(page).allInnerTexts();
    const index = entries.findIndex((entry) =>
      entry.trim().startsWith("Recording interrupted")
    );
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(entries.length - 1);
  });
});

test.describe("YAML", () => {
  test("shows the AgentRun resource and switches to JSON", async ({ page }) => {
    await page.goto(stageUrl("1", "3", "configured", { tab: "yaml" }));
    const panel = tabPanel(page);
    const format = panel.getByRole("group", { name: "Format" });
    await expect(format.getByRole("button", { name: "YAML" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(panel).toContainText("kind: AgentRun");
    await expect(panel).toContainText("name: run-1-validate");

    await format.getByRole("button", { name: "JSON" }).click();
    await expect(format.getByRole("button", { name: "JSON" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(panel).toContainText('"kind": "AgentRun"');
    await expect(panel).toContainText('"name": "run-1-validate"');
    await expect(panel).not.toContainText("kind: AgentRun");
  });
});

test.describe("Context window", () => {
  test("a started stage shows its context window as the last Agent run fact, on Details only", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured"));
    const section = agentRunFacts(page);
    await expect(section.getByRole("term").last()).toHaveText(
      /^Context window\s*$/
    );
    const value = section.getByRole("definition").last();
    await expect(value).toHaveText(/^[\d.]+K of [\d.]+K tokens \(\d+%\)/);
    await expect(
      value.getByRole("progressbar", { name: "Context window", exact: true })
    ).toBeVisible();
    for (const name of ["Transcript", "Logs", "YAML"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      // (The transcript may mention the context window; no fact or bar.)
      await expect(
        main(page).getByRole("term").filter({ hasText: "Context window" })
      ).toHaveCount(0);
      await expect(main(page).getByRole("progressbar")).toHaveCount(0);
    }
  });

  test("the context window term explains itself in a popover", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "3", "configured"));
    await main(page)
      .getByRole("button", { name: "More information about context" })
      .click();
    const popover = page.getByRole("dialog", { name: "Context window" });
    await expect(popover).toContainText(
      "How full the agent's context window is."
    );
    await popover.getByRole("button", { name: "Close" }).click();
    await expect(popover).toHaveCount(0);
  });

  test("a stage whose model does not meter context says Not reported", async ({
    page,
  }) => {
    // Run 6, stage 27 (Upgrade runtime) uses the self-hosted model.
    await page.goto(stageUrl("6", "27", "configured"));
    await expect(main(page).getByText("Context window")).toBeVisible();
    await expect(
      main(page).getByRole("progressbar", { name: /Context window/ })
    ).toHaveCount(0);
    await expect(agentRunFacts(page).getByRole("definition").last()).toHaveText(
      "Not reported"
    );
  });
});

test.describe("Stage header", () => {
  test("the tabs directly follow the header: no alert or measurement between them", async ({
    page,
  }) => {
    // A failed stage has an alert and a context window; both are tab content.
    await page.goto(stageUrl("1", "2", "failed", { stage: 2 }));
    await expect(main(page).getByRole("tablist")).toBeVisible();
    // The section right before the tabs is the header itself.
    expect(
      await main(page)
        .getByRole("tablist")
        .evaluate(
          (tablist) =>
            tablist
              .closest("section")
              ?.previousElementSibling?.querySelector("h1") != null
        )
    ).toBe(true);
    const header = main(page)
      .getByRole("heading", { level: 1 })
      .locator("xpath=ancestor::section[1]");
    await expect(header.getByRole("heading", { name: /alert:/ })).toHaveCount(
      0
    );
    await expect(header.getByRole("progressbar")).toHaveCount(0);
    await expect(
      alertTitle(tabPanel(page), "Danger", /.* failed/)
    ).toBeVisible();
  });

  test("the header names the run's application, linking to it with the trail", async ({
    page,
  }) => {
    // Run 2 is on one application: its name is a link (a run on several
    // shows the application Select, stage-application-select.spec.ts).
    await page.goto(stageUrl("2", "4", "configured"));
    const { runs } = await fixtureGraph(page);
    const run = runs.find((candidate) => String(candidate.id) === "2");
    expect(run).toBeDefined();
    const names = run!.applications.map((application) => application.name);
    expect(names).toHaveLength(1);
    const title = main(page).getByRole("heading", { level: 1 });
    const header = title.locator("xpath=ancestor::section[1]");
    await expect(
      header.getByText(`Application: ${names[0]}`, { exact: true })
    ).toBeVisible();
    const stageName = await title.textContent();
    await header.getByRole("link", { name: names[0], exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: names[0], exact: true })
    ).toBeVisible();
    // The trail leads back through the stage.
    await expect(
      breadcrumb(page).getByRole("link", { name: stageName!, exact: true })
    ).toBeVisible();
  });

  test("the header of a run on several applications names the selected one in a Select", async ({
    page,
  }) => {
    await page.goto(stageUrl("1", "1", "configured"));
    const { runs } = await fixtureGraph(page);
    const run = runs.find((candidate) => String(candidate.id) === "1");
    const names = run!.applications.map((application) => application.name);
    expect(names.length).toBeGreaterThan(1);
    const header = main(page)
      .getByRole("heading", { level: 1 })
      .locator("xpath=ancestor::section[1]");
    await expect(
      header.getByRole("button", { name: `Application: ${names[0]}` })
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: names[0], exact: true })
    ).toHaveCount(0);
  });
});

test.describe("Attention alert on the views", () => {
  test("a stage awaiting approval offers Approve on its Logs tab, without View logs", async ({
    page,
  }) => {
    // The run page's alert leads to the stage that waits for approval.
    await page.goto(protoUrl("/plan-runs/2", { scenario: "actionRequired" }));
    await expect(
      alertTitle(main(page), "Warning", /.* needs approval/)
    ).toBeVisible();
    await main(page).getByRole("link", { name: "Review stage" }).click();
    await expect(page).toHaveURL(/\/stages\//);
    await expect(
      alertTitle(tabPanel(page), "Warning", /.* needs approval/)
    ).toBeVisible();
    await expect(
      tabPanel(page).getByRole("link", { name: "View logs" })
    ).toBeVisible();

    await tab(page, "Logs").click();
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    await expect(
      alertTitle(tabPanel(page), "Warning", /.* needs approval/)
    ).toBeVisible();
    await expect(
      tabPanel(page).getByRole("button", {
        name: "Approve and continue",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      main(page).getByRole("link", { name: "View logs" })
    ).toHaveCount(0);
    await expect(logRegion(page)).toBeVisible();
  });

  test("a pending stage explains itself on Details only", async ({ page }) => {
    await page.goto(stageUrl("2", "5", "configured"));
    await expect(alertTitle(tabPanel(page), "Info")).toBeVisible();
    for (const name of ["Transcript", "Logs", "YAML"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      await expect(
        main(page).getByRole("heading", { name: /alert:/ })
      ).toHaveCount(0);
    }
  });
});

test.describe("Failed stage leads to its logs", () => {
  test("View logs in the failed alert opens the Logs tab", async ({ page }) => {
    // Run 1, stage 2 (Migrate) failed.
    await page.goto(stageUrl("1", "2", "failed", { stage: 2 }));
    const alert = main(page).locator(".pf-v6-c-alert.pf-m-danger").first();
    await expect(alert).toBeVisible();
    await alert.getByRole("link", { name: "View logs" }).click();
    await expect(tab(page, "Logs")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]tab=logs\b/);
    await expect(page).toHaveURL(/[?&]protoScenario=failed\b/);
    await expect(logRegion(page)).toBeVisible();
  });
});
