import { act, renderHook } from "@testing-library/react";

import { ApplicationMigrationView, PlanRun } from "@app/agentic";

import {
  rerunInitialValues,
  useRunMigrationPlanLauncher,
} from "./run-migration-plan-launcher";

const run = {
  id: "4",
  name: "Run #4 — Java EE lift and shift",
  planId: "3",
  planName: "Java EE lift and shift",
  applications: [
    { id: 2, name: "Policy Administration" },
    { id: 4, name: "Order Service" },
  ],
  status: "Failed",
  targetBranch: "mta/lift-and-shift",
  startedAt: "2026-11-09T16:30:00Z",
  stageRuns: [],
} as PlanRun;

const view = (planId: string): ApplicationMigrationView => ({
  configured: true,
  plan: { id: planId, name: `Plan ${planId}` },
  intervention: "none",
  stages: [],
});

describe("rerunInitialValues", () => {
  it("keeps each application's own plan when it is the run's plan", () => {
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3"), 4: view("3") })
    ).toEqual({
      planSelection: "recommended",
      targetBranch: "mta/lift-and-shift",
    });
  });

  it("uses the run's plan for all when an application now resolves elsewhere", () => {
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3"), 4: view("1") })
    ).toEqual({
      planSelection: "single",
      planId: "3",
      targetBranch: "mta/lift-and-shift",
    });
  });

  it("reads only the applications being launched", () => {
    // The application Migration tab launches its own application from a
    // run of several, holding only that application's view.
    const ownApplication = [run.applications[0]];
    expect(rerunInitialValues(run, ownApplication, { 2: view("3") })).toEqual({
      planSelection: "recommended",
      targetBranch: "mta/lift-and-shift",
    });
    expect(
      rerunInitialValues(run, ownApplication, { 2: view("1") })
    ).toMatchObject({ planSelection: "single", planId: "3" });
  });

  it("uses the run's plan while the views are unknown", () => {
    expect(rerunInitialValues(run, run.applications, undefined)).toMatchObject({
      planSelection: "single",
      planId: "3",
    });
    expect(
      rerunInitialValues(run, run.applications, { 2: view("3") })
    ).toMatchObject({
      planSelection: "single",
    });
    expect(rerunInitialValues(run, [], {})).toMatchObject({
      planSelection: "single",
    });
  });
});

// The hook's collaborators: the scope check, the start mutation, the views
// query and the applications-owned modal, whose props are what it decides.
const mockCanRun = { value: true };
const mockStarted: { onStarted?: () => void } = {};
const mockViews = {
  isLoading: false,
  migrations: {} as Record<number, unknown>,
};
jest.mock("@app/auth", () => ({
  useHasSomeScopes: () => mockCanRun.value,
}));
jest.mock(
  "@app/pages/applications/components/agentic-migration/use-start-migrations",
  () => ({
    useStartMigrations: (_crumbs: unknown, onStarted: () => void) => {
      mockStarted.onStarted = onStarted;
      return { startMigrations: jest.fn(), isStarting: false };
    },
  })
);
jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: (ids: number[]) => ({
    isLoading: ids.length > 0 && mockViews.isLoading,
    fetchError: undefined,
    migrations: ids.length > 0 ? mockViews.migrations : {},
  }),
}));
jest.mock(
  "@app/pages/applications/components/agentic-migration/migration-preflight-modal",
  () => ({
    MigrationPreflightModal: () => null,
  })
);

describe("useRunMigrationPlanLauncher", () => {
  beforeEach(() => {
    mockCanRun.value = true;
    mockViews.isLoading = false;
    mockViews.migrations = {};
  });

  // The modal element the hook returns; its props are the hook's decisions.
  let current: () => { modal: React.ReactElement | null };
  const modalProps = () => current().modal?.props;

  const launch = (
    options: Partial<Parameters<typeof useRunMigrationPlanLauncher>[0]>
  ) => {
    const hook = renderHook(() =>
      useRunMigrationPlanLauncher({ linkCrumbs: [], ...options })
    );
    current = () => hook.result.current;
    return hook;
  };

  it("offers no launcher without the run write scope", () => {
    mockCanRun.value = false;
    const { result } = launch({ applications: run.applications });
    expect(result.current.open).toBeUndefined();
    expect(result.current.modal).toBeNull();
  });

  it("opens on the hook's applications, or on those given to open", () => {
    const { result } = launch({ applications: [run.applications[0]] });
    expect(result.current.modal).toBeNull();

    act(() => result.current.open?.());
    expect(result.current.modal).not.toBeNull();
    expect(modalProps()?.applications).toEqual([run.applications[0]]);
    expect(modalProps()?.rerunPlanId).toBeUndefined();

    act(() => result.current.open?.([run.applications[1]]));
    expect(modalProps()?.applications).toEqual([run.applications[1]]);
  });

  it("treats a click event as no applications", () => {
    const { result } = launch({ applications: [run.applications[0]] });
    act(() =>
      (result.current.open as unknown as (event: object) => void)({
        type: "click",
      })
    );
    expect(modalProps()?.applications).toEqual([run.applications[0]]);
  });

  it("closes and tells the caller once runs start", () => {
    const onStarted = jest.fn();
    const { result } = launch({ applications: run.applications, onStarted });
    act(() => result.current.open?.());
    act(() => mockStarted.onStarted?.());
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(result.current.modal).toBeNull();
  });

  it("reruns a failed run from its values and names its plan for the caution", () => {
    mockViews.isLoading = true;
    const { result, rerender } = launch({ rerunOf: run });
    act(() => result.current.open?.());
    // While the views load, the run's plan; the modal remounts once they arrive.
    expect(modalProps()?.applications).toEqual(run.applications);
    expect(modalProps()?.initialValues).toMatchObject({
      planSelection: "single",
      planId: "3",
    });
    expect(modalProps()?.rerunPlanId).toBe("3");
    const loadingKey = (result.current.modal as React.ReactElement).key;

    mockViews.isLoading = false;
    mockViews.migrations = { 2: view("3"), 4: view("3") };
    rerender();
    expect(modalProps()?.initialValues).toEqual({
      planSelection: "recommended",
      targetBranch: "mta/lift-and-shift",
    });
    expect((result.current.modal as React.ReactElement).key).not.toBe(
      loadingKey
    );
  });
});
