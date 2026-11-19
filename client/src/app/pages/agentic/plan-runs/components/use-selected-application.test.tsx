import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { Location } from "history";
import { MemoryRouter, Route } from "react-router-dom";

import { ControllerRunPhase, HubRef, StageAgentRun } from "@app/agentic";

import { useSelectedApplication } from "./use-selected-application";

jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

const claims = { id: 3, name: "Claims Processing" };
const underwriting = { id: 8, name: "Underwriting Workbench" };
const billing = { id: 11, name: "Billing" };
const applications = [claims, underwriting, billing];

const agentRun = (
  application: HubRef,
  phase: ControllerRunPhase
): StageAgentRun => ({
  name: `run-1-migrate-app-${application.id}`,
  runId: "1",
  stageId: "2",
  application,
  phase,
  containers: ["agent"],
});

interface Props {
  applications: HubRef[];
  stageAgentRuns: StageAgentRun[];
  isReady: boolean;
}

const renderSelection = (initialProps: Props, search = "") => {
  let location: Location | undefined;
  let replaces = 0;
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/plan-runs/1/stages/2",
          search,
          state: { breadcrumbs: [{ title: "Plan runs", path: "/plan-runs" }] },
        },
      ]}
    >
      {children}
      <Route
        render={(props) => {
          if (location != null && props.history.action === "REPLACE") {
            if (props.location.key !== location.key) replaces += 1;
          }
          location = props.location;
          return null;
        }}
      />
    </MemoryRouter>
  );
  const hook = renderHook((props: Props) => useSelectedApplication(props), {
    initialProps,
    wrapper,
  });
  return {
    ...hook,
    location: () => location,
    param: () => new URLSearchParams(location?.search).get("application"),
    replaces: () => replaces,
  };
};

describe("useSelectedApplication", () => {
  it("waits for the agent runs, then writes the default once, keeping the other parameters and the trail", () => {
    const view = renderSelection(
      { applications, stageAgentRuns: [], isReady: false },
      "?tab=logs&from=agent-4"
    );
    expect(view.result.current.selectedId).toBeUndefined();
    expect(view.param()).toBeNull();

    view.rerender({
      applications,
      stageAgentRuns: [
        agentRun(claims, "Succeeded"),
        agentRun(underwriting, "Failed"),
        agentRun(billing, "Running"),
      ],
      isReady: true,
    });
    expect(view.result.current.selectedId).toBe(underwriting.id);
    expect(view.param()).toBe(String(underwriting.id));
    const search = new URLSearchParams(view.location()?.search);
    expect(search.get("tab")).toBe("logs");
    expect(search.get("from")).toBe("agent-4");
    expect(
      (view.location()?.state as { breadcrumbs: unknown[] }).breadcrumbs
    ).toHaveLength(1);
    expect(view.replaces()).toBe(1);
  });

  it("picks Action required over Failed, then the run's order", () => {
    const waiting = renderSelection({
      applications,
      stageAgentRuns: [
        agentRun(claims, "Failed"),
        agentRun(underwriting, "Succeeded"),
        agentRun(billing, "AwaitingApproval"),
      ],
      isReady: true,
    });
    expect(waiting.param()).toBe(String(billing.id));

    const first = renderSelection({
      applications,
      stageAgentRuns: [
        agentRun(billing, "Succeeded"),
        agentRun(underwriting, "Succeeded"),
        agentRun(claims, "Succeeded"),
      ],
      isReady: true,
    });
    expect(first.param()).toBe(String(claims.id));
  });

  it("takes the first application when the agent runs could not be read", () => {
    const view = renderSelection({
      applications,
      stageAgentRuns: [],
      isReady: true,
    });
    expect(view.result.current.selectedId).toBe(claims.id);
    expect(view.param()).toBe(String(claims.id));
  });

  it("never moves the selection when a status changes later", () => {
    const view = renderSelection({
      applications,
      stageAgentRuns: [
        agentRun(claims, "Running"),
        agentRun(underwriting, "Running"),
      ],
      isReady: true,
    });
    expect(view.param()).toBe(String(claims.id));
    view.rerender({
      applications,
      stageAgentRuns: [
        agentRun(claims, "Running"),
        agentRun(underwriting, "AwaitingApproval"),
      ],
      isReady: true,
    });
    expect(view.result.current.selectedId).toBe(claims.id);
    expect(view.param()).toBe(String(claims.id));
    expect(view.replaces()).toBe(1);
  });

  it("keeps an application named in the URL, and replaces an unknown one", () => {
    const named = renderSelection(
      {
        applications,
        stageAgentRuns: [agentRun(claims, "Failed")],
        isReady: true,
      },
      "?application=11"
    );
    expect(named.result.current.selectedId).toBe(billing.id);
    expect(named.replaces()).toBe(0);

    const unknown = renderSelection(
      {
        applications,
        stageAgentRuns: [agentRun(underwriting, "Failed")],
        isReady: true,
      },
      "?application=99"
    );
    expect(unknown.param()).toBe(String(underwriting.id));
  });

  it("writes what the user selects", () => {
    const view = renderSelection({
      applications,
      stageAgentRuns: [],
      isReady: true,
    });
    act(() => view.result.current.select(billing.id));
    expect(view.result.current.selectedId).toBe(billing.id);
    expect(view.param()).toBe(String(billing.id));
  });

  it("leaves the URL alone in a run on one application", () => {
    const view = renderSelection({
      applications: [claims],
      stageAgentRuns: [agentRun(claims, "Failed")],
      isReady: true,
    });
    expect(view.result.current.isSeveral).toBe(false);
    expect(view.result.current.selectedId).toBe(claims.id);
    expect(view.param()).toBeNull();
    expect(view.replaces()).toBe(0);
  });
});
