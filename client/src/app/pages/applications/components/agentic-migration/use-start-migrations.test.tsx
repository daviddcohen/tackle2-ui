jest.unmock("react-router-dom");

import * as React from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import {
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
} from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { BreadcrumbEntry } from "@app/hooks/useBreadcrumbs";

import { useStartMigrations } from "./use-start-migrations";

// The start mutation: the test plays the server's answer.
const mockMutation: {
  onSuccess?: (
    response: StartApplicationMigrationsResponse,
    request: StartApplicationMigrationsRequest
  ) => void;
} = {};
jest.mock("@app/queries/agentic", () => ({
  useStartApplicationMigrationsMutation: (
    onSuccess: typeof mockMutation.onSuccess
  ) => {
    mockMutation.onSuccess = onSuccess;
    return { mutate: jest.fn(), isPending: false };
  },
}));

const request: StartApplicationMigrationsRequest = {
  applicationIds: [1, 2, 3],
  planSelection: "recommended",
  targetBranch: "konveyor/agentic-migration",
};

const start = (linkCrumbs: BreadcrumbEntry[] = []) => {
  const history = createMemoryHistory({ initialEntries: ["/applications"] });
  const pushNotification = jest.fn();
  const onStarted = jest.fn();
  renderHook(() => useStartMigrations(linkCrumbs, onStarted), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>
        <NotificationsContext.Provider
          value={{
            pushNotification,
            dismissNotification: jest.fn(),
            notifications: [],
          }}
        >
          {children}
        </NotificationsContext.Provider>
      </Router>
    ),
  });
  return { history, pushNotification, onStarted };
};

describe("useStartMigrations", () => {
  it("opens the plan run when one was created", () => {
    const { history, pushNotification, onStarted } = start();
    act(() =>
      mockMutation.onSuccess?.(
        { planRuns: [{ id: "7", name: "Run #7" }] },
        request
      )
    );
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(history.location.pathname).toBe("/plan-runs/7");
    expect(pushNotification).not.toHaveBeenCalled();
  });

  it("stays and links to the plan runs when several were created", () => {
    const { history, pushNotification } = start();
    act(() =>
      mockMutation.onSuccess?.(
        {
          planRuns: [
            { id: "7", name: "Run #7" },
            { id: "8", name: "Run #8" },
          ],
        },
        request
      )
    );
    expect(history.location.pathname).toBe("/applications");
    expect(pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "agentic.execution.planRunsStarted",
        variant: "success",
      })
    );
    const { message } = pushNotification.mock.calls[0][0];
    expect(message.props.children).toBe("agentic.execution.viewPlanRuns");
  });

  it("opens the plan runs with the page's trail from the toast", async () => {
    // The inventory's trail: the plan runs list shows it as
    // "Application inventory > Plan runs" (plan-runs.test.tsx).
    const crumbs = [{ title: "Application inventory", path: "/applications" }];
    const { history, pushNotification } = start(crumbs);
    act(() =>
      mockMutation.onSuccess?.(
        {
          planRuns: [
            { id: "7", name: "Run #7" },
            { id: "8", name: "Run #8" },
          ],
        },
        request
      )
    );
    const { message } = pushNotification.mock.calls[0][0];
    render(<Router history={history}>{message}</Router>);
    await userEvent.click(
      screen.getByRole("link", { name: "agentic.execution.viewPlanRuns" })
    );
    expect(history.location.pathname).toBe("/plan-runs");
    expect(history.location.state).toEqual({ breadcrumbs: crumbs });
  });

  it("stays and says so when none was created", () => {
    const { history, pushNotification } = start();
    act(() => mockMutation.onSuccess?.({ planRuns: [] }, request));
    expect(history.location.pathname).toBe("/applications");
    expect(pushNotification).toHaveBeenCalledWith({
      title: "agentic.execution.noPlanRunStarted",
      variant: "danger",
    });
  });
});
