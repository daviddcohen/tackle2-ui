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

const plans = [
  { id: "1", name: "Java EE to Quarkus", stages: [] },
  { id: "2", name: "Spring Boot to Quarkus", stages: [] },
] as unknown as MigrationPlan[];

const renderModal = (
  props: Partial<ComponentProps<typeof MigrationPreflightModal>> = {}
) => {
  const onStartReady = jest.fn();
  render(
    <Router history={createMemoryHistory()}>
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
        targetBranch: "mta/spring-quarkus",
      },
    });
    await waitFor(() => expect(startButton()).toBeEnabled());
    await user.click(startButton());
    await waitFor(() =>
      expect(onStartReady).toHaveBeenCalledWith({
        applicationIds: [1],
        planSelection: "single",
        planId: "2",
        targetBranch: "mta/spring-quarkus",
      })
    );
  });

  it("cannot start when no selected application is ready", async () => {
    renderModal({ applications: applications.slice(1) });
    expect(startButton()).toBeDisabled();
  });
});
