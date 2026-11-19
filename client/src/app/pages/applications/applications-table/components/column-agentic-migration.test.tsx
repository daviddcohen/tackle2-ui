jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { ColumnAgenticMigration } from "./column-agentic-migration";

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

const renderCell = (
  migration: ApplicationMigrationView | undefined,
  isLoading = false
) =>
  render(
    <Router history={createMemoryHistory()}>
      <ColumnAgenticMigration
        migration={migration}
        isLoading={isLoading}
        applicationId={7}
        linkTo={(pathname, search = "") => `${pathname}${search}`}
      />
    </Router>
  );

describe("ColumnAgenticMigration", () => {
  it("links the status to the application's Migration tab", () => {
    renderCell(view({ runPhase: "Succeeded" }));
    expect(
      screen.getByRole("link", { name: "agentic.runStatus.succeeded" })
    ).toHaveAttribute("href", "/applications/7?tab=migration");
  });

  it("says where a run is: plan and stage", () => {
    renderCell(
      view({
        runPhase: "Running",
        intervention: "actionRequired",
        currentStage: "Prepare proposal",
      })
    );
    expect(
      screen.getByRole("link", { name: "agentic.runStatus.awaitingApproval" })
    ).toBeInTheDocument();
    expect(screen.getByText("agentic.execution.planStage")).toBeInTheDocument();
  });

  it("shows the plan alone for a run with no current stage yet", () => {
    renderCell(view({ runPhase: "Pending" }));
    expect(screen.getByText("Java EE to Quarkus")).toBeInTheDocument();
  });

  it("names the plan the run uses, not the plan the next run would use", () => {
    renderCell(
      view({
        runPhase: "Pending",
        planRunPlan: { id: "3", name: "Java EE lift and shift" },
      })
    );
    expect(screen.getByText("Java EE lift and shift")).toBeInTheDocument();
    expect(screen.queryByText("Java EE to Quarkus")).not.toBeInTheDocument();
  });

  it("shows the server's reason, not linked, before a blocked start", () => {
    renderCell(
      view({
        preflight: "blocked",
        preflightReason: "A source control credential reference is missing.",
      })
    );
    const reason = screen.getByText(
      "A source control credential reference is missing."
    );
    expect(reason.closest("a")).toBeNull();
  });

  it("has no second line for a finished or ready migration", () => {
    const { container } = renderCell(view({ runPhase: "Failed" }));
    expect(container).toHaveTextContent(/^agentic\.runStatus\.failed$/);
    expect(screen.queryByText("Java EE to Quarkus")).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and Unavailable on error", () => {
    const { unmount } = renderCell(undefined, true);
    expect(screen.getByText("terms.loading")).toBeInTheDocument();
    unmount();
    renderCell(undefined, false);
    expect(screen.getByText("agentic.common.unavailable")).toBeInTheDocument();
  });
});
