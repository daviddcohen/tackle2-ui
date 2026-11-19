import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { PlanRun, StageRun } from "@app/agentic";
import { render, screen, waitFor, within } from "@app/test-config/test-utils";

import {
  StageAttentionAlert,
  StageAttentionAlertProps,
  getStageAttention,
} from "./stage-attention-alert";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const stage = (
  order: number,
  name: string,
  status: StageRun["status"],
  overrides: Partial<StageRun> = {}
): StageRun => ({
  stageId: String(order),
  name,
  agent: { id: String(order), name: `${name} Agent` },
  instructions: "",
  requiresApproval: false,
  order,
  status,
  ...overrides,
});

const planRun = (
  status: PlanRun["status"],
  stageRuns: StageRun[],
  applications = 3
): PlanRun => ({
  id: "1",
  name: "Run #1 — Java EE to Quarkus",
  planId: "1",
  planName: "Java EE to Quarkus",
  applications: Array.from({ length: applications }, (_, index) => ({
    id: index + 1,
    name: `App ${index + 1}`,
  })),
  status,
  targetBranch: "konveyor/agentic-migration",
  startedAt: "2026-11-10T10:06:00Z",
  stageRuns,
});

const awaiting = planRun("AwaitingApproval", [
  stage(2, "Migrate", "Pending"),
  stage(1, "Prepare proposal", "AwaitingApproval", { requiresApproval: true }),
  stage(3, "Validate", "Pending"),
]);

const failed = planRun("Failed", [
  stage(1, "Prepare proposal", "Failed", {
    output:
      "Error: Unable to resolve dependency tree.\n14 conflicting packages.",
  }),
  stage(2, "Migrate", "Pending"),
]);

const reviewStageTo = (stageRun: StageRun) =>
  `/plan-runs/1/stages/${stageRun.stageId}`;

const renderAlert = (props: StageAttentionAlertProps) =>
  render(
    <MemoryRouter>
      <StageAttentionAlert {...props} />
    </MemoryRouter>
  );

const alertBox = () =>
  screen.getAllByRole("heading")[0].closest(".pf-v6-c-alert") as HTMLElement;

describe("getStageAttention", () => {
  it("finds the decision, then a failure, on the whole run", () => {
    expect(getStageAttention(awaiting)).toMatchObject({
      kind: "approval",
      stageRun: { name: "Prepare proposal" },
      next: { name: "Migrate" },
    });
    expect(getStageAttention(failed)).toMatchObject({
      kind: "failed",
      stageRun: { name: "Prepare proposal" },
    });
    expect(getStageAttention(planRun("Failed", []))).toEqual({
      kind: "failed",
    });
    expect(
      getStageAttention(planRun("Running", [stage(1, "A", "Running")]))
    ).toBeUndefined();
  });

  it("says why a stage has not run on its own page", () => {
    const byName = (name: string) =>
      awaiting.stageRuns.find((s) => s.name === name);
    const [first, last] = [byName("Migrate"), byName("Validate")];
    expect(getStageAttention(awaiting, first)).toEqual({
      kind: "pending",
      key: "agentic.stageAttention.startsAfterApproval",
      values: { stage: "Prepare proposal" },
    });
    expect(getStageAttention(awaiting, last)).toEqual({
      kind: "pending",
      key: "agentic.stageAttention.startsAfterStage",
      values: { stage: "Migrate" },
    });
    const queued = planRun("Pending", [
      stage(1, "Prepare proposal", "Pending"),
    ]);
    expect(getStageAttention(queued, queued.stageRuns[0])).toEqual({
      kind: "pending",
      key: "agentic.stageAttention.startsWithRun",
    });
    expect(getStageAttention(failed, failed.stageRuns[1])).toEqual({
      kind: "pending",
      key: "agentic.stageAttention.didNotRunStageFailed",
      values: { stage: "Prepare proposal" },
    });
    const stopped = planRun("Failed", [stage(1, "Migrate", "Pending")]);
    expect(getStageAttention(stopped, stopped.stageRuns[0])).toEqual({
      kind: "pending",
      key: "agentic.stageAttention.didNotRunRunFailed",
    });
  });
});

describe("StageAttentionAlert, approval", () => {
  it("asks an approver on the run page and confirms before approving", async () => {
    const user = userEvent.setup();
    const onApprove = jest.fn().mockResolvedValue(undefined);
    renderAlert({
      surface: "run",
      planRun: awaiting,
      onApprove,
      reviewStageTo,
    });

    expect(
      screen.getByRole("heading", { name: /Prepare proposal needs approval/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Prepare proposal Agent finished Prepare proposal. Review it, then approve to start Migrate."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review stage" })).toHaveAttribute(
      "href",
      "/plan-runs/1/stages/1"
    );
    expect(
      screen.queryByRole("button", { name: "Reject" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Approve and continue" })
    );
    expect(onApprove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Approve and continue?" })
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Prepare proposal is approved and Migrate starts next. This decision applies to all 3 applications in Run #1 — Java EE to Quarkus."
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Approve and continue" })
    );
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: "1" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("never says 'your approval' to someone who cannot approve", () => {
    renderAlert({ surface: "run", planRun: awaiting, reviewStageTo });

    expect(
      screen.getByText(
        "Prepare proposal Agent finished Prepare proposal. Waiting for approval."
      )
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // No buttons: navigation is the alert's action link.
    expect(screen.getByRole("link", { name: "Review stage" })).toHaveAttribute(
      "href",
      "/plan-runs/1/stages/1"
    );
  });

  it("points at the evidence on the stage page, without a link to itself", () => {
    renderAlert({
      surface: "stage",
      planRun: awaiting,
      stageRun: awaiting.stageRuns[1],
      onApprove: jest.fn(),
      reviewStageTo,
    });

    expect(
      screen.getByText(
        "Prepare proposal Agent finished Prepare proposal. Check its activity and commits below, then approve to start Migrate."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("completes the run when no stage follows", async () => {
    const user = userEvent.setup();
    const last = planRun(
      "AwaitingApproval",
      [stage(1, "Validate", "AwaitingApproval")],
      1
    );
    renderAlert({
      surface: "run",
      planRun: last,
      onApprove: jest.fn(),
      reviewStageTo,
    });

    expect(
      screen.getByText(
        "Validate Agent finished Validate. Review it, then approve to complete the run."
      )
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Approve and continue" })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Validate is approved and the run completes. This decision applies to the only application in Run #1 — Java EE to Quarkus."
    );
  });

  it("picks the body from the surface, not from the callbacks", () => {
    renderAlert({
      surface: "application",
      planRun: awaiting,
      onApprove: jest.fn(),
      reviewStageTo,
    });
    expect(
      screen.getByText(
        "Prepare proposal Agent finished Prepare proposal. Approving starts Migrate for all 3 applications in Run #1 — Java EE to Quarkus."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reject" })
    ).not.toBeInTheDocument();
  });

  it("offers Reject with a warning confirm on the application tab", async () => {
    const user = userEvent.setup();
    const onReject = jest.fn().mockResolvedValue(undefined);
    renderAlert({
      surface: "application",
      planRun: awaiting,
      onApprove: jest.fn(),
      onReject,
      reviewStageTo,
    });

    expect(
      screen.getByText(
        "Prepare proposal Agent finished Prepare proposal. Approving starts Migrate for all 3 applications in Run #1 — Java EE to Quarkus."
      )
    ).toBeInTheDocument();
    // One action row: Approve, Reject, Review stage.
    const row = alertBox().querySelector(".pf-v6-c-action-list") as HTMLElement;
    expect(
      Array.from(row.querySelectorAll("button, a")).map((el) => el.textContent)
    ).toEqual(["Approve and continue", "Reject", "Review stage"]);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /Reject and fail the run\?/ })
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Prepare proposal is marked failed and the run stops. This decision applies to all 3 applications in Run #1 — Java EE to Quarkus. This action cannot be undone."
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: "1" })
    );
  });

  it("closes the confirm when the decision fails", async () => {
    const user = userEvent.setup();
    renderAlert({
      surface: "run",
      planRun: awaiting,
      onApprove: jest.fn().mockRejectedValue(new Error("409")),
      reviewStageTo,
    });
    await user.click(
      screen.getByRole("button", { name: "Approve and continue" })
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Approve and continue",
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });
});

describe("StageAttentionAlert, failure", () => {
  it("shows the first line of output, the next step and the actions", async () => {
    const user = userEvent.setup();
    const onRunMigrationPlan = jest.fn();
    renderAlert({
      surface: "run",
      planRun: failed,
      onRunMigrationPlan,
      reviewStageTo,
    });

    expect(
      screen.getByRole("heading", { name: /Prepare proposal failed/ })
    ).toBeInTheDocument();
    const paragraphs = Array.from(alertBox().querySelectorAll("p")).map(
      (p) => p.textContent
    );
    expect(paragraphs).toEqual([
      "Error: Unable to resolve dependency tree.",
      "Fix the cause in the application repositories, then run the migration plan again.",
    ]);
    expect(screen.getByRole("link", { name: "Review stage" })).toHaveAttribute(
      "href",
      "/plan-runs/1/stages/1"
    );
    await user.click(
      screen.getByRole("button", { name: "Run migration plan" })
    );
    expect(onRunMigrationPlan).toHaveBeenCalledTimes(1);
  });

  it("keeps only the next step without output, and Review stage as a link", () => {
    renderAlert({
      surface: "run",
      planRun: planRun("Failed", [stage(1, "Migrate", "Failed")]),
      reviewStageTo,
    });

    expect(
      Array.from(alertBox().querySelectorAll("p")).map((p) => p.textContent)
    ).toEqual([
      "Fix the cause in the application repositories, then run the migration plan again.",
    ]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Review stage" })
    ).toBeInTheDocument();
  });

  it("names the run when no stage failed", () => {
    renderAlert({
      surface: "run",
      planRun: planRun("Failed", [stage(1, "Migrate", "Succeeded")]),
      reviewStageTo,
      onRunMigrationPlan: jest.fn(),
    });

    expect(
      screen.getByRole("heading", { name: /Plan run failed/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the application's summary and evidence instead of the output", () => {
    renderAlert({
      surface: "application",
      planRun: failed,
      failureDetails: {
        summary: "Validation stopped after two integration tests failed.",
        evidence: ["InventoryRepositoryIT: expected 200, received 500"],
      },
    });

    expect(
      screen.getByText("Validation stopped after two integration tests failed.")
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "InventoryRepositoryIT: expected 200, received 500"
    );
    expect(
      screen.queryByText("Error: Unable to resolve dependency tree.")
    ).not.toBeInTheDocument();
  });

  it("says what blocks a new run before the next step", () => {
    renderAlert({
      surface: "application",
      planRun: failed,
      failureDetails: { summary: "Validation failed." },
      restartBlockedReason: "Run #2 is already running for this application.",
      onRunMigrationPlan: jest.fn(),
    });

    expect(
      Array.from(alertBox().querySelectorAll("p")).map((p) => p.textContent)
    ).toEqual([
      "Validation failed.",
      "Before it can run again: Run #2 is already running for this application.",
      "Fix the cause in the application repositories, then run the migration plan again.",
    ]);
    // Still one alert.
    expect(document.querySelectorAll(".pf-v6-c-alert")).toHaveLength(1);
  });

  it("links the plan run when the failure names no stage", () => {
    const failedRun = planRun("Failed", [stage(1, "Migrate", "Succeeded")]);
    const { unmount } = renderAlert({
      surface: "application",
      planRun: failedRun,
      planRunTo: "/plan-runs/1",
    });
    expect(
      screen.getByRole("heading", { name: /Plan run failed/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View plan run" })).toHaveAttribute(
      "href",
      "/plan-runs/1"
    );
    unmount();

    renderAlert({
      surface: "application",
      planRun: failedRun,
      planRunTo: "/plan-runs/1",
      onRunMigrationPlan: jest.fn(),
    });
    // With a button, the link sits beside it as a link-variant button.
    expect(
      within(alertBox()).getByRole("link", { name: "View plan run" })
    ).toHaveClass("pf-v6-c-button", "pf-m-link");
  });

  it("omits paragraph 1 when the application reports no summary or evidence", () => {
    renderAlert({
      surface: "application",
      planRun: failed,
      failureDetails: { evidence: [] },
    });

    const body = alertBox().querySelector(".pf-v6-c-alert__description");
    expect(body?.querySelectorAll(".pf-v6-l-stack__item")).toHaveLength(1);
    expect(
      Array.from(alertBox().querySelectorAll("p")).map((p) => p.textContent)
    ).toEqual([
      "Fix the cause in the application repositories, then run the migration plan again.",
    ]);
  });
});

describe("StageAttentionAlert, pending stage", () => {
  it("is a plain info title on the stage page", () => {
    renderAlert({
      surface: "stage",
      planRun: awaiting,
      stageRun: awaiting.stageRuns[0],
    });

    expect(
      screen.getByRole("heading", {
        name: /This stage starts after Prepare proposal is approved\./,
      })
    ).toBeInTheDocument();
    expect(alertBox()).toHaveClass("pf-m-info", "pf-m-plain");
  });

  it("renders nothing when nothing needs attention", () => {
    const wrapper = jest.fn((alert: React.ReactElement) => (
      <section>{alert}</section>
    ));
    const { container } = renderAlert({
      surface: "run",
      planRun: planRun("Running", [stage(1, "Migrate", "Running")]),
      wrapper,
    });
    expect(container).toBeEmptyDOMElement();
    expect(wrapper).not.toHaveBeenCalled();
  });

  it("places the alert in the caller's wrapper when it shows", () => {
    const { container } = renderAlert({
      surface: "run",
      planRun: failed,
      wrapper: (alert) => <section id="attention">{alert}</section>,
    });
    expect(container.querySelector("#attention .pf-v6-c-alert")).toHaveClass(
      "pf-m-danger"
    );
  });
});
