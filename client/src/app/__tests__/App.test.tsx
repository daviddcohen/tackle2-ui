import { matchPath } from "react-router-dom";

import { render, screen, waitFor } from "@app/test-config/test-utils";

import App from "../App";
import { Paths } from "../Paths";
import { toRoutePath } from "../Routes";

describe("App shell", () => {
  beforeEach(() => window.history.pushState({}, "", Paths.applications));

  // jsdom is narrower than PatternFly's sidebar breakpoint, so the sidebar
  // renders collapsed (aria-hidden): role queries need `hidden: true`.
  //
  // test-utils renders inside AuthProvider, which picks NoAuthStrategy here
  // (AUTH_REQUIRED unset, NODE_ENV=test): there is no MasqueradeAuthStrategy,
  // as in a production build or an OIDC session.
  it("renders without the masquerade auth strategy or prototype controls", async () => {
    const consoleError = jest.spyOn(console, "error");

    render(<App />);

    expect(
      await screen.findByRole("navigation", { name: "Nav", hidden: true })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("link", {
          name: "sidebar.applicationInventory",
          hidden: true,
        })
      ).toBeInTheDocument()
    );
    expect(
      document.querySelector("[data-prototype-slot]")
    ).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("MasqueradeAuthStrategy"),
      })
    );
    consoleError.mockRestore();
  });

  it("hides the agentic UI when AGENTIC_ENABLED is off", async () => {
    render(<App />);

    expect(
      await screen.findByRole("navigation", { name: "Nav", hidden: true })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "sidebar.agents", hidden: true })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "sidebar.planRuns", hidden: true })
    ).not.toBeInTheDocument();
  });
});

describe("feature flags", () => {
  const loadWithEnv = (env: Record<string, string>) => {
    let modules:
      | {
          constants: typeof import("../Constants");
          routes: typeof import("../Routes");
        }
      | undefined;
    jest.isolateModules(() => {
      jest.doMock("../env", () => ({
        ENV: {
          NODE_ENV: "production",
          MOCK: "off",
          AUTH_REQUIRED: "false",
          AGENTIC_ENABLED: "false",
          ...env,
        },
      }));
      modules = {
        constants: jest.requireActual("../Constants"),
        routes: jest.requireActual("../Routes"),
      };
    });
    jest.dontMock("../env");
    if (modules == null) throw new Error("modules not loaded");
    return modules;
  };

  it("registers no agentic routes without AGENTIC_ENABLED", () => {
    const { routes } = loadWithEnv({ AGENTIC_ENABLED: "false" });
    expect(routes.agenticRoutes).toHaveLength(0);
    expect(routes.agenticAdministrationRoutes).toHaveLength(0);
  });

  it("registers the agentic routes with AGENTIC_ENABLED", () => {
    const { routes } = loadWithEnv({ AGENTIC_ENABLED: "true" });
    expect(routes.agenticRoutes.map((route) => route.path)).toContain(
      Paths.planRuns
    );
    expect(
      routes.agenticAdministrationRoutes.map((route) => route.path)
    ).toEqual([Paths.providers, Paths.models]);
  });

  it("never enables the prototype outside a development bundle", () => {
    // jest runs with NODE_ENV=test, like a production bundle it is not
    // "development", so the prototype stays off even with the mock on.
    const { constants } = loadWithEnv({
      AGENTIC_ENABLED: "true",
      MOCK: "stub",
    });
    expect(constants.isAgenticEnabled).toBe(true);
    expect(constants.isPrototypeEnabled).toBe(false);
  });
});

describe("route patterns", () => {
  const applicationDetails = toRoutePath({
    path: Paths.applicationDetails,
    comp: () => null,
    numericIds: true,
  });

  it("matches numeric ids only when numericIds is set", () => {
    expect(applicationDetails).toBe("/applications/:applicationId(\\d+)");
    expect(
      matchPath("/applications/12", { path: applicationDetails, exact: true })
    ).not.toBeNull();
    expect(
      matchPath("/applications/analysis-tab", {
        path: applicationDetails,
        exact: true,
      })
    ).toBeNull();
  });

  it("constrains every id param of a nested path", () => {
    expect(
      toRoutePath({
        path: Paths.stageRunDetails,
        comp: () => null,
        numericIds: true,
      })
    ).toBe("/plan-runs/:runId(\\d+)/stages/:stageId(\\d+)");
  });

  it("leaves other routes untouched", () => {
    expect(toRoutePath({ path: Paths.skills, comp: () => null })).toBe(
      Paths.skills
    );
  });
});
