import * as React from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { SkillsByStage, StageSkill } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import {
  EVERY_STAGE_COLLAPSE_AFTER,
  StageSkillsTable,
  StageSkillsTableProps,
} from "./stage-skills-table";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const javaCoder = { id: "7", name: "Java Code Migrator" };
const proposer = { id: "1", name: "Migration Proposal Agent" };
const foundation = { id: "c1", name: "Java modernization foundation" };
const javaEE = { id: 1, name: "Java EE Application" };
const quarkus = { id: 11, name: "Quarkus 3.x" };
const jakarta = { id: "3", name: "Jakarta EE namespace migration" };

/** Run #1: two stages (given out of order), then two applications. */
const runSkills: SkillsByStage = {
  stages: [
    {
      order: 2,
      name: "Migrate",
      agent: javaCoder,
      stageId: "sr2",
      skills: [
        {
          skill: { id: "20", name: "Spring Boot to Quarkus migration" },
          loadPolicy: "skill",
          from: [
            { kind: "collection", agent: javaCoder, collection: foundation },
          ],
          excluded: true,
        },
        {
          skill: jakarta,
          loadPolicy: "skill",
          from: [
            { kind: "collection", agent: javaCoder, collection: foundation },
          ],
          excluded: false,
        },
        {
          skill: { id: "10", name: "Incremental transformation workflow" },
          loadPolicy: "rule",
          from: [{ kind: "agent", agent: javaCoder }],
          excluded: false,
        },
      ],
    },
    {
      order: 1,
      name: "Prepare proposal",
      agent: proposer,
      stageId: "sr1",
      skills: [
        {
          skill: { id: "4", name: "API compatibility checklist" },
          loadPolicy: "skill",
          from: [{ kind: "agent", agent: proposer }],
          excluded: false,
        },
      ],
    },
  ],
  everyStage: [
    {
      application: { id: 3, name: "Claims Processing" },
      skills: [
        // Also in stage 2: shown in both groups.
        {
          skill: jakarta,
          loadPolicy: "skill",
          from: [
            { kind: "archetype", archetype: javaEE },
            {
              kind: "targetProfile",
              targetProfile: quarkus,
              archetype: javaEE,
            },
          ],
          excluded: false,
        },
        {
          skill: { id: "8", name: "EJB to CDI conversion patterns" },
          loadPolicy: "skill",
          from: [
            {
              kind: "application",
              application: { id: 3, name: "Claims Processing" },
            },
          ],
          excluded: false,
        },
      ],
    },
    { application: { id: 4, name: "Underwriting Workbench" }, skills: [] },
  ],
};

const linkTo = (pathname: string, search: string) => `${pathname}${search}`;

const renderTable = (props: Partial<StageSkillsTableProps> = {}) =>
  render(
    <MemoryRouter>
      <StageSkillsTable
        skills={runSkills}
        context="run"
        aria-label="Skills by stage"
        linkTo={linkTo}
        {...props}
      />
    </MemoryRouter>
  );

const groupTitles = () =>
  screen.getAllByRole("heading").map((heading) => heading.textContent);

/** The visible cells of each skill row (the title rows have one wide cell). */
const visibleRows = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .filter((row) => !row.hidden)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .filter((text) => text !== "")
    );

describe("StageSkillsTable", () => {
  it("lists the stages in order, then Every stage, with aligned skill rows", () => {
    renderTable();

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual(["Row expansion", "Skill", "From", "How agents use it"]);
    expect(groupTitles()).toEqual([
      "Stage 1: Prepare proposal",
      "Stage 2: Migrate",
      "Every stage: Claims Processing",
      "Every stage: Underwriting Workbench",
    ]);
    expect(visibleRows()).toEqual([
      ["Stage 1: Prepare proposalRun by Migration Proposal Agent"],
      [
        "API compatibility checklist",
        "Agent: Migration Proposal Agent",
        "Available when needed",
      ],
      ["Stage 2: MigrateRun by Java Code Migrator"],
      // Sorted by name; the excluded one says so in the last column.
      [
        "Incremental transformation workflow",
        "Agent: Java Code Migrator",
        "Always followed",
      ],
      [
        "Jakarta EE namespace migration",
        "Collection: Java modernization foundation",
        "Available when needed",
      ],
      [
        "Spring Boot to Quarkus migration",
        "Collection: Java modernization foundation",
        "Excluded",
      ],
      // The same subtitle in every context.
      [
        "Every stage: Claims ProcessingArchetype, target profile and application skills",
      ],
      // Linked run page: the group's own application reads "This
      // application".
      [
        "EJB to CDI conversion patterns",
        "This application",
        "Available when needed",
      ],
      [
        "Jakarta EE namespace migration",
        "Archetype: Java EE ApplicationTarget profile: Quarkus 3.x (Java EE Application)",
        "Available when needed",
      ],
      [
        "Every stage: Underwriting WorkbenchArchetype, target profile and application skills",
      ],
      ["No skills"],
    ]);
    expect(screen.getByText("Excluded")).toHaveClass("pf-v6-c-label__text");
  });

  it("renders every row the data gives, a skill in two groups twice", () => {
    renderTable();
    expect(
      screen.getAllByRole("link", { name: "Jakarta EE namespace migration" })
    ).toHaveLength(2);
  });

  it("links names where they are edited, with the caller's linkTo", () => {
    renderTable();
    expect(
      screen.getByRole("link", { name: "API compatibility checklist" })
    ).toHaveAttribute("href", "/skills/4");
    // "Run by" and the agent origin both link to the agent.
    expect(
      screen.getAllByRole("link", { name: "Java Code Migrator" })[0]
    ).toHaveAttribute("href", "/agents/7");
    // The Every stage title (its own skills read "This application").
    for (const application of screen.getAllByRole("link", {
      name: "Claims Processing",
    })) {
      expect(application).toHaveAttribute("href", "/applications/3?tab=skills");
    }
    expect(
      screen.getByRole("link", { name: "Java EE Application" })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1");
    expect(screen.getByRole("link", { name: "Quarkus 3.x" })).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
  });

  it("is plain text without linkTo", () => {
    renderTable({ linkTo: undefined });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("API compatibility checklist")).toBeVisible();
    // The Run dialog: the application's name stays, it helps there.
    expect(
      screen.getByRole("row", { name: /^EJB to CDI conversion patterns/ })
    ).toHaveTextContent("Application: Claims Processing");
    expect(screen.queryByText("This application")).toBeNull();
  });

  it("names each toggle after its group title, PF's way", async () => {
    renderTable({ id: "run-skills" });
    const toggle = screen.getByRole("button", {
      name: "Stage 2: Migrate Details",
    });
    expect(toggle).toHaveAttribute("id", "run-skills-toggle-1");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", {
        name: "Every stage: Claims Processing Details",
      })
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Stage 2: Migrate" })
    ).toHaveAttribute("id", "simple-node1");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByText("Incremental transformation workflow")
    ).not.toBeVisible();
    // The collapsed title row says what it holds, after "Run by".
    expect(screen.getByText("3 skills, 1 excluded")).toBeVisible();
    expect(toggle).toHaveFocus();
  });

  it("keeps ids unique on a page with rowIndexOffset", () => {
    renderTable({ rowIndexOffset: 100 });
    expect(
      screen.getByRole("heading", { name: "Stage 1: Prepare proposal" })
    ).toHaveAttribute("id", "simple-node100");
    expect(
      screen.getByRole("button", { name: "Stage 1: Prepare proposal Details" })
    ).toBeVisible();
  });

  it("starts collapsed with defaultExpanded none, with each group's count", async () => {
    renderTable({ defaultExpanded: "none" });
    expect(visibleRows()).toEqual([
      ["Stage 1: Prepare proposalRun by Migration Proposal Agent·1 skill"],
      ["Stage 2: MigrateRun by Java Code Migrator·3 skills, 1 excluded"],
      [
        "Every stage: Claims ProcessingArchetype, target profile and application skills·2 skills",
      ],
      [
        "Every stage: Underwriting WorkbenchArchetype, target profile and application skills·No skills",
      ],
    ]);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Every stage: Claims Processing Details",
      })
    );
    expect(
      screen.getByRole("link", { name: "EJB to CDI conversion patterns" })
    ).toBeVisible();
    expect(screen.queryByText("2 skills")).toBeNull();
  });

  it("opens only the stage groups with defaultExpanded stages", () => {
    expect(EVERY_STAGE_COLLAPSE_AFTER).toBe(3);
    renderTable({ defaultExpanded: "stages" });
    const expanded = (name: string) =>
      screen
        .getByRole("button", { name: `${name} Details` })
        .getAttribute("aria-expanded");
    expect(expanded("Stage 1: Prepare proposal")).toBe("true");
    expect(expanded("Stage 2: Migrate")).toBe("true");
    expect(expanded("Every stage: Claims Processing")).toBe("false");
    expect(expanded("Every stage: Underwriting Workbench")).toBe("false");
  });

  it("says Every stage outside a run, with the same subtitle", () => {
    renderTable({
      context: "plan",
      skills: {
        stages: runSkills.stages,
        everyStage: [{ skills: runSkills.everyStage[0].skills }],
      },
      originOptions: { archetypeId: 1 },
    });
    expect(groupTitles()).toEqual([
      "Stage 1: Prepare proposal",
      "Stage 2: Migrate",
      "Every stage",
    ]);
    // A plan holds no application skills.
    expect(
      screen.getByText("Archetype and target profile skills")
    ).toBeVisible();
    // The plan's own archetype: no suffix.
    expect(screen.getByText(/^Target profile:/).textContent).toBe(
      "Target profile: Quarkus 3.x"
    );
  });

  it("says This application on that application's page", () => {
    renderTable({
      context: "application",
      originOptions: { archetypeId: 1, thisApplicationId: 3 },
      filter: { applicationId: 3 },
    });
    expect(groupTitles()).toEqual([
      "Stage 1: Prepare proposal",
      "Stage 2: Migrate",
      "Every stage",
    ]);
    expect(screen.getByText("This application")).toBeVisible();
  });

  it("filters to one stage and one application's Every stage group", () => {
    renderTable({ filter: { stageId: "sr2", applicationId: 4 } });
    expect(groupTitles()).toEqual([
      "Stage 2: Migrate",
      "Every stage: Underwriting Workbench",
    ]);
  });

  it("adds an Include checkbox per row that names its stage", async () => {
    const onChange = jest.fn();
    renderTable({ context: "plan", linkTo: undefined, include: { onChange } });

    expect(screen.getAllByRole("columnheader")[1]).toHaveTextContent("Include");
    const excluded = screen.getByRole("checkbox", {
      name: "Include Spring Boot to Quarkus migration in stage 2",
    });
    expect(excluded).not.toBeChecked();
    await userEvent.click(excluded);
    expect(onChange).toHaveBeenLastCalledWith(
      { id: "20", name: "Spring Boot to Quarkus migration" },
      true
    );

    const everyStage = screen.getByRole("checkbox", {
      name: "Include Jakarta EE namespace migration in every stage",
    });
    expect(everyStage).toBeChecked();
    await userEvent.click(everyStage);
    expect(onChange).toHaveBeenLastCalledWith(jakarta, false);

    // A plan cannot exclude a skill attached to the application itself.
    expect(
      screen.getByRole("checkbox", {
        name: "Include EJB to CDI conversion patterns in every stage",
      })
    ).toBeDisabled();
  });

  it("takes the caller's lock rule and excluded label for each row", async () => {
    const onChange = jest.fn();
    const isLocked = (entry: StageSkill) => entry.skill.id === "20";
    renderTable({
      linkTo: undefined,
      include: {
        onChange,
        isLocked,
        excludedLabel: (entry) =>
          isLocked(entry) ? "Excluded by plan" : undefined,
      },
    });

    // Locked and excluded: disabled, its label says why and describes it.
    const locked = screen.getByRole("checkbox", {
      name: "Include Spring Boot to Quarkus migration in stage 2",
    });
    expect(locked).toBeDisabled();
    expect(locked).not.toBeChecked();
    expect(locked).toHaveAccessibleDescription("Excluded by plan");

    // The rule replaces the default: an application's own skill can change.
    const own = screen.getByRole("checkbox", {
      name: "Include EJB to CDI conversion patterns in every stage",
    });
    expect(own).toBeEnabled();
    expect(own).not.toHaveAccessibleDescription();
    await userEvent.click(own);
    expect(onChange).toHaveBeenLastCalledWith(
      { id: "8", name: "EJB to CDI conversion patterns" },
      false
    );
  });

  it("labels an excluded row Excluded when the caller gives no label", () => {
    renderTable({
      linkTo: undefined,
      include: { onChange: jest.fn(), excludedLabel: () => undefined },
    });
    const row = screen
      .getByRole("checkbox", {
        name: "Include Spring Boot to Quarkus migration in stage 2",
      })
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("Excluded")).toBeInTheDocument();
  });

  it("has a help popover on How agents use it", async () => {
    renderTable();
    await userEvent.click(
      screen.getByRole("button", {
        name: "More information about how agents use it",
      })
    );
    expect(
      await screen.findByText(/Always followed: the agent gets the whole skill/)
    ).toBeVisible();
  });

  it("shows skeleton rows while loading", () => {
    renderTable({ skills: undefined, isLoading: true });
    expect(screen.getByRole("grid")).toBeVisible();
    expect(screen.getByText("Loading skills")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows the load error with Try again", async () => {
    const onRetry = jest.fn();
    renderTable({ isError: true, onRetry });
    expect(screen.getByText("Skills could not be loaded.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("says Unavailable when the server does not report skills", () => {
    renderTable({
      skills: undefined,
      unavailableText: "This server does not report the skills of a run yet.",
    });
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(
      screen.getByText("This server does not report the skills of a run yet.")
    ).toBeVisible();
    expect(screen.queryByText("None")).toBeNull();
  });

  it("titles a stage without a name by its number", () => {
    renderTable({
      context: "plan",
      skills: {
        stages: [{ ...runSkills.stages[1], name: " " }],
        everyStage: [],
      },
    });
    expect(groupTitles()).toEqual(["Stage 1"]);
  });

  it("asks for a stage when a draft has none", () => {
    // The plan preview always has its Every stage group, even without stages.
    renderTable({
      context: "plan",
      skills: { stages: [], everyStage: [{ skills: [] }] },
    });
    expect(screen.getByText("Add a stage to see what it gets.")).toBeVisible();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("shows the error body under the alert title", () => {
    renderTable({
      isError: true,
      errorBody: "You can still run the migration plan.",
    });
    expect(screen.getByText("Skills could not be loaded.")).toBeVisible();
    expect(
      screen.getByText("You can still run the migration plan.")
    ).toBeVisible();
  });

  it("gives every Every stage title the same subtitle in a run, after the application", () => {
    renderTable();
    for (const name of ["Claims Processing", "Underwriting Workbench"]) {
      const titleRow = screen
        .getByRole("heading", { name: `Every stage: ${name}` })
        .closest("tr") as HTMLElement;
      expect(
        within(titleRow).getByText(
          "Archetype, target profile and application skills"
        )
      ).toBeVisible();
    }
  });

  it("gives the Skill and From columns PF widths", () => {
    renderTable({ include: { onChange: jest.fn() } });
    const header = (name: string) => screen.getByRole("columnheader", { name });
    expect(header("Skill")).toHaveClass("pf-m-width-30");
    expect(header("From")).toHaveClass("pf-m-width-40");
  });
});
