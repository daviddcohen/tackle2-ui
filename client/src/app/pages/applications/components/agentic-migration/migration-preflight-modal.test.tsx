jest.unmock("react-router-dom");

import { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";

import {
  ApplicationMigrationMap,
  ApplicationMigrationView,
  MigrationPlan,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  DEFAULT_TARGET_BRANCH,
  MigrationPreflightModal,
} from "./migration-preflight-modal";

const view = (
  overrides: Partial<ApplicationMigrationView>
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  plan: { id: "1", name: "Java EE to Quarkus" },
  ...overrides,
});

const applications = [
  { id: 1, name: "Customer Management" },
  { id: 2, name: "Branch Operations" },
  { id: 3, name: "Inventory Service" },
];

const migrations: ApplicationMigrationMap = {
  1: view({}),
  2: view({
    preflight: "blocked",
    preflightReason: "A source control credential reference is missing.",
  }),
  3: view({ preflight: "reviewRequired" }),
};

const plans: MigrationPlan[] = [
  { id: "1", name: "Java EE to Quarkus", description: "", stages: [] },
  { id: "2", name: "Spring Boot to Quarkus", description: "", stages: [] },
];

const renderModal = (
  props: Partial<ComponentProps<typeof MigrationPreflightModal>> = {},
  currentPath = "/"
) => {
  const onStartReady = jest.fn();
  render(
    <Router history={createMemoryHistory({ initialEntries: [currentPath] })}>
      <MigrationPreflightModal
        applications={applications}
        migrations={migrations}
        linkTo={(pathname) => pathname}
        onClose={jest.fn()}
        onStartReady={onStartReady}
        {...props}
      />
    </Router>
  );
  return { onStartReady };
};

const startButton = () =>
  screen.getByRole("button", { name: "agentic.execution.startReady" });
const targetBranch = () =>
  screen.getByRole("textbox", { name: /agentic\.execution\.targetBranch/ });

describe("MigrationPreflightModal", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json(plans))
      )
    );
  });

  it("starts only the ready applications with the recommended Plan", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal();
    expect(targetBranch()).toHaveValue(DEFAULT_TARGET_BRANCH);
    expect(
      screen.getByText("A source control credential reference is missing.")
    ).toBeInTheDocument();
    await waitFor(() => expect(startButton()).toBeEnabled());
    await user.click(startButton());
    await waitFor(() =>
      expect(onStartReady).toHaveBeenCalledWith({
        applicationIds: [1],
        planSelection: "recommended",
        planId: undefined,
        targetBranch: DEFAULT_TARGET_BRANCH,
      })
    );
  });

  it("requires a target branch and trims it", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal();
    await user.clear(targetBranch());
    await user.type(targetBranch(), "   ");
    await waitFor(() => expect(startButton()).toBeDisabled());
    expect(
      await screen.findByText("agentic.execution.targetBranchRequired")
    ).toBeInTheDocument();

    await user.clear(targetBranch());
    await user.type(targetBranch(), "  feature/x  ");
    await waitFor(() => expect(startButton()).toBeEnabled());
    await user.click(startButton());
    await waitFor(() =>
      expect(onStartReady).toHaveBeenCalledWith(
        expect.objectContaining({ targetBranch: "feature/x" })
      )
    );
  });

  it("requires a Plan when overriding the recommended Plan", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(startButton()).toBeEnabled());
    await user.click(
      screen.getByRole("radio", { name: /agentic\.execution\.singlePlan/ })
    );
    await waitFor(() => expect(startButton()).toBeDisabled());
    await user.click(
      screen.getByRole("radio", { name: /agentic\.execution\.recommendedPlan/ })
    );
    await waitFor(() => expect(startButton()).toBeEnabled());
  });

  it("submits the override Plan when one is prefilled", async () => {
    const user = userEvent.setup();
    const { onStartReady } = renderModal({
      initialValues: {
        planSelection: "single",
        planId: "2",
        targetBranch: "konveyor/spring-quarkus",
      },
    });
    await waitFor(() => expect(startButton()).toBeEnabled());
    await user.click(startButton());
    await waitFor(() =>
      expect(onStartReady).toHaveBeenCalledWith({
        applicationIds: [1],
        planSelection: "single",
        planId: "2",
        targetBranch: "konveyor/spring-quarkus",
      })
    );
  });

  it("is a dialog named by its title", () => {
    renderModal();
    expect(
      screen.getByRole("dialog", { name: "agentic.execution.startMigration" })
    ).toBeInTheDocument();
  });

  it("shows the readiness first, by name, with the ready count", () => {
    renderModal();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Branch Operations"),
      expect.stringContaining("Customer Management"),
      expect.stringContaining("Inventory Service"),
    ]);
    // 1 of 3: the caption adds that only ready applications start.
    expect(
      screen.getByText(/agentic\.execution\.readyCaption/)
    ).toHaveTextContent(
      "agentic.execution.readyCaption agentic.execution.readyOnly"
    );
  });

  it("shows Not selected for the plan until one plan for all is picked", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getAllByText("Java EE to Quarkus")).toHaveLength(3);
    await user.click(
      screen.getByRole("radio", { name: /agentic\.execution\.singlePlan/ })
    );
    expect(screen.getAllByText("agentic.execution.notSelected")).toHaveLength(
      3
    );
    expect(screen.queryByText("Java EE to Quarkus")).not.toBeInTheDocument();
    expect(
      screen.getByText("agentic.execution.overrideCaution")
    ).toBeInTheDocument();
  });

  it("hides the override caution only while the rerun's own plan is picked", async () => {
    const user = userEvent.setup();
    renderModal({
      rerunPlanId: "1",
      initialValues: { planSelection: "single", planId: "1" },
    });
    await screen.findAllByText("Java EE to Quarkus");
    expect(
      screen.queryByText("agentic.execution.overrideCaution")
    ).not.toBeInTheDocument();
    // Another plan is a real override.
    await user.click(
      screen.getByRole("button", { name: "agentic.execution.planOverride" })
    );
    await user.click(await screen.findByText("Spring Boot to Quarkus"));
    expect(
      await screen.findByText("agentic.execution.overrideCaution")
    ).toBeInTheDocument();
  });

  it("links the run a reason names, and offers the run otherwise", () => {
    const run = { id: "1", name: "Run #1 — Java EE to Quarkus" };
    renderModal({
      migrations: {
        ...migrations,
        2: view({
          preflight: "blocked",
          planRun: run,
          preflightReason: `${run.name} already migrated this application.`,
        }),
        3: view({
          preflight: "blocked",
          planRun: run,
          preflightReason: "A source control credential reference is missing.",
        }),
      },
    });
    expect(screen.getByRole("link", { name: run.name })).toHaveAttribute(
      "href",
      "/plan-runs/1"
    );
    expect(
      screen.getByText("already migrated this application.", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "agentic.execution.viewPlanRun" })
    ).toHaveAttribute("href", "/plan-runs/1");
  });

  it("does not link the page it was opened from", () => {
    const run = { id: "1", name: "Run #1 — Java EE to Quarkus" };
    renderModal(
      {
        migrations: {
          ...migrations,
          2: view({
            preflight: "blocked",
            planRun: run,
            preflightReason: `${run.name} already migrated this application.`,
          }),
        },
      },
      "/applications/1"
    );
    expect(
      screen.queryByRole("link", { name: "Customer Management" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Customer Management")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Branch Operations" })
    ).toHaveAttribute("href", "/applications/2");
    expect(screen.getByRole("link", { name: run.name })).toBeInTheDocument();
  });

  it("does not link the run it was opened from", () => {
    const run = { id: "1", name: "Run #1 — Java EE to Quarkus" };
    renderModal(
      {
        migrations: {
          ...migrations,
          2: view({
            preflight: "blocked",
            planRun: run,
            preflightReason: `${run.name} already migrated this application.`,
          }),
          3: view({
            preflight: "blocked",
            planRun: run,
            preflightReason:
              "A source control credential reference is missing.",
          }),
        },
      },
      "/plan-runs/1"
    );
    expect(
      screen.queryByRole("link", { name: run.name })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`${run.name} already migrated this application.`)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "agentic.execution.viewPlanRun" })
    ).not.toBeInTheDocument();
  });

  it("offers only Close when no selected application is ready", () => {
    renderModal({ applications: applications.slice(1) });
    expect(
      screen.getByText("agentic.execution.noneReadyTitle")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "agentic.execution.startReady" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /agentic\.execution\.singlePlan/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.close" })).toHaveClass(
      "pf-m-secondary"
    );
  });
});
