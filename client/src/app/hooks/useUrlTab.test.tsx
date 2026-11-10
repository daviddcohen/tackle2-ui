// The shared test setup mocks useLocation; this hook needs the real router.
jest.unmock("react-router-dom");

import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router-dom";

import { useUrlTab } from "./useUrlTab";

const tabs = ["overview", "runs"] as const;

const renderAt = (url: string) => {
  let search = "";
  const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
    <MemoryRouter initialEntries={[url]}>
      {children}
      <Route
        render={({ location }) => {
          search = location.search;
          return null;
        }}
      />
    </MemoryRouter>
  );
  const view = renderHook(() => useUrlTab(tabs, "overview"), { wrapper });
  return { ...view, search: () => search };
};

describe("useUrlTab", () => {
  it("returns the tab named in the URL", () => {
    const { result } = renderAt("/plans/1?tab=runs");
    expect(result.current[0]).toBe("runs");
  });

  it.each(["/plans/1", "/plans/1?tab=bogus", "/plans/1?tab="])(
    "falls back to the default tab for %s",
    (url) => {
      const { result } = renderAt(url);
      expect(result.current[0]).toBe("overview");
    }
  );

  it("writes the selected tab to the URL and keeps other parameters", () => {
    const { result, search } = renderAt("/plans/1?from=run-2");
    act(() => result.current[1]("runs"));
    expect(result.current[0]).toBe("runs");
    expect(new URLSearchParams(search()).get("from")).toBe("run-2");
    expect(new URLSearchParams(search()).get("tab")).toBe("runs");
  });

  it("ignores a key that is not one of the tabs", () => {
    const { result, search } = renderAt("/plans/1?tab=runs");
    act(() => result.current[1]("bogus"));
    expect(result.current[0]).toBe("runs");
    expect(new URLSearchParams(search()).get("tab")).toBe("runs");
  });
});
