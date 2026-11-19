import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { Agent, ModelProjection } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { StagesTable, StagesTableRow } from "./stages-table";

const agents = [
  {
    id: "1",
    name: "Code Migrator",
    model: { id: "m1", name: "Claude" },
  },
] as Agent[];

const models = [
  {
    id: "m1",
    name: "Claude",
    provider: { id: "p", name: "Anthropic" },
    verificationStatus: "pending",
  },
] as ModelProjection[];

const rows: StagesTableRow[] = [
  {
    key: "a",
    name: "Migrate",
    agentId: "1",
    instructions: "First.\n\nSecond.",
    requiresApproval: true,
  },
  {
    key: "b",
    name: "Validate",
    agentId: "9",
    agentName: "Deleted Agent",
    instructions: "",
    requiresApproval: false,
  },
];

const renderTable = (
  props: Partial<React.ComponentProps<typeof StagesTable>>
) =>
  render(
    <MemoryRouter>
      <StagesTable
        aria-label="Stages"
        rows={rows}
        agents={agents}
        models={models}
        isLoading={false}
        {...props}
      />
    </MemoryRouter>
  );

describe("StagesTable", () => {
  it("shows each stage with its agent, model, provider and markers", () => {
    renderTable({ agentLinkTo: (id) => `/agents/${id}` });
    const [, first, second] = screen.getAllByRole("row");
    expect(within(first).getByText("agentic.plan.requiresApproval"));
    expect(
      within(first).getByRole("link", { name: "Code Migrator" })
    ).toHaveAttribute("href", "/agents/1");
    expect(within(first).getByText("Anthropic")).toBeInTheDocument();
    expect(
      within(first).getByLabelText("agentic.plan.modelNotVerified")
    ).toBeInTheDocument();
    // An agent the agents query no longer has: its stored name, no model.
    expect(within(second).getByText("Deleted Agent")).toBeInTheDocument();
    expect(
      within(second).getByText("agentic.common.unavailable")
    ).toBeInTheDocument();
  });

  it("names agents as plain text without a link builder (wizard Review)", () => {
    renderTable({});
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Code Migrator")).toBeInTheDocument();
  });

  it("expands a stage to its instructions, one paragraph each", async () => {
    const user = userEvent.setup();
    renderTable({});
    const firstToggle = screen.getByRole("button", { name: "Migrate Details" });
    await user.click(firstToggle);
    expect(screen.getByText("First.")).toBeVisible();
    expect(screen.getByText("Second.")).toBeVisible();
  });

  it("gives each table its own expand ids (the edit wizard opens over the plan page)", () => {
    render(
      <MemoryRouter>
        <StagesTable
          aria-label="Plan"
          rows={rows}
          agents={agents}
          models={models}
          isLoading={false}
        />
        <StagesTable
          aria-label="Review"
          rows={[
            { ...rows[0], name: "Migrate renamed" },
            { ...rows[1], key: "c", name: "Validate renamed" },
          ]}
          agents={agents}
          models={models}
          isLoading={false}
          rowIndexOffset={200}
        />
      </MemoryRouter>
    );
    const ids = screen
      .getAllByRole("button", { name: /Details$/ })
      .map((toggle) => toggle.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    // Each toggle is named by its own table's stage, the second row too.
    for (const name of [
      "Migrate",
      "Validate",
      "Migrate renamed",
      "Validate renamed",
    ]) {
      expect(
        screen.getByRole("button", { name: `${name} Details` })
      ).toBeVisible();
    }
    expect(document.getElementById("simple-node200")).toHaveTextContent(
      "Migrate renamed"
    );
    expect(document.getElementById("simple-node201")).toHaveTextContent(
      "Validate renamed"
    );
  });

  it("names each toggle after its stage", () => {
    renderTable({});
    expect(
      screen
        .getAllByRole("button", { name: /Details$/ })
        .map((toggle) => toggle.getAttribute("aria-labelledby"))
    ).toEqual([
      expect.stringMatching(/^simple-node0 /),
      expect.stringMatching(/^simple-node1 /),
    ]);
    expect(
      screen.getByRole("button", { name: "Migrate Details" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Validate Details" })
    ).toBeVisible();
  });

  it("marks a model the models query does not list", () => {
    renderTable({ rows: [rows[0]], models: [] });
    const [, row] = screen.getAllByRole("row");
    expect(within(row).getByText("Claude")).toBeInTheDocument();
    expect(
      within(row).getByLabelText("agentic.plan.modelNotVerified")
    ).toBeInTheDocument();
  });

  it("has no marker when the models query failed", () => {
    renderTable({ rows: [rows[0]], models: undefined });
    const [, row] = screen.getAllByRole("row");
    expect(within(row).getByText("Claude")).toBeInTheDocument();
    expect(
      within(row).queryByLabelText("agentic.plan.modelNotVerified")
    ).toBeNull();
  });

  it("shows a skeleton for the model while agents or models load", () => {
    renderTable({ isLoading: true, agents: undefined, models: undefined });
    expect(screen.getAllByText("terms.loading")).toHaveLength(2);
  });
});
