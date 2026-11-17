// The shared test setup mocks useLocation; this hook needs the real router.
jest.unmock("react-router-dom");

import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { createBrowserHistory } from "history";
import { Router } from "react-router-dom";

import { useUrlParams } from "./useUrlParams";

const renderUnder = (basename: string, url: string) => {
  window.history.replaceState(null, "", url);
  const history = createBrowserHistory({ basename });
  const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
    <Router history={history}>{children}</Router>
  );
  return renderHook(
    () =>
      useUrlParams({
        keys: ["filter"],
        defaultValue: { filter: "" },
        serialize: ({ filter }) => ({ filter: filter || null }),
        deserialize: ({ filter }) => ({ filter: filter ?? "" }),
      }),
    { wrapper }
  );
};

afterEach(() => window.history.replaceState(null, "", "/"));

describe("useUrlParams", () => {
  it.each([
    ["", "/applications"],
    ["/tackle2-ui", "/tackle2-ui/applications"],
  ])(
    "keeps the page path when updating params (basename %j)",
    (basename, url) => {
      const { result } = renderUnder(basename, `${url}?other=1`);
      act(() => result.current[1]({ filter: "name" }));
      expect(window.location.pathname).toBe(url);
      expect(new URLSearchParams(window.location.search).get("filter")).toBe(
        "name"
      );
      expect(new URLSearchParams(window.location.search).get("other")).toBe(
        "1"
      );
      expect(result.current[0]).toEqual({ filter: "name" });
    }
  );
});
