import { render, screen, waitFor } from "@app/test-config/test-utils";

import App from "../App";
import { Paths } from "../Paths";

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
  });
});

describe("feature flags", () => {
  it("never enables the prototype outside a development bundle", () => {
    // jest runs with NODE_ENV=test, like a production bundle it is not
    // "development", so the prototype stays off even with the mock on.
    let modules: { constants: typeof import("../Constants") } | undefined;
    jest.isolateModules(() => {
      jest.doMock("../env", () => ({
        ENV: {
          NODE_ENV: "production",
          MOCK: "stub",
          AUTH_REQUIRED: "false",
          AGENTIC_ENABLED: "true",
        },
      }));
      modules = {
        constants: jest.requireActual("../Constants"),
      };
    });
    jest.dontMock("../env");
    if (modules == null) throw new Error("modules not loaded");
    expect(modules.constants.isAgenticEnabled).toBe(true);
    expect(modules.constants.isPrototypeEnabled).toBe(false);
  });
});
