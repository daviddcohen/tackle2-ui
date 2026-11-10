jest.unmock("react-router-dom");

import { act, renderHook } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { breadcrumbTo, useBreadcrumbs } from "./useBreadcrumbs";
import { useUrlParams } from "./useUrlParams";

describe("contextual breadcrumbs", () => {
  const trail = [
    { title: "Inventory", path: "/applications?filters=java&page=2" },
    { title: "Application", path: "/applications/7?tab=plan-runs" },
    { title: "Run", path: "/plan-runs/3" },
    { title: "Skill", path: "/skills/4?tab=associations" },
  ];

  it("restores the ancestor view and removes descendants on a cross-entity cycle", () => {
    const destination = breadcrumbTo("/applications/7", "?from=skill-4", trail);
    expect(destination).toEqual({
      pathname: "/applications/7",
      search: "?tab=plan-runs",
      hash: "",
      state: { breadcrumbs: trail.slice(0, 1) },
    });
  });

  it("keeps different selected drawers distinct while recognizing the same entity across tab changes", () => {
    const entries = [
      { title: "Archetypes", path: "/archetypes?ar:page=2" },
      { title: "Archetype", path: "/archetypes?ar:activeItem=4&ar:tab=2" },
    ];
    expect(
      breadcrumbTo("/archetypes", "?ar:activeItem=4", entries).state.breadcrumbs
    ).toEqual(entries.slice(0, 1));
    expect(
      breadcrumbTo("/archetypes", "?ar:activeItem=5", entries).state.breadcrumbs
    ).toEqual(entries);
  });

  it("keeps profile anchors in the destination and does not confuse different profiles", () => {
    const entry = {
      title: "Target profile",
      path: "/archetypes/4/target-profiles#target-profile-41",
    };
    const destination = breadcrumbTo(
      "/archetypes/4/target-profiles#target-profile-42",
      "",
      [entry]
    );
    expect(destination.hash).toBe("#target-profile-42");
    expect(destination.state.breadcrumbs).toEqual([entry]);
  });

  it("captures the actual URL and carries a flat trail without nesting location state", () => {
    const history = createMemoryHistory({
      initialEntries: [
        {
          pathname: "/skills/4",
          search: "?tab=associations",
          hash: "#details",
          state: { breadcrumbs: trail.slice(0, 3), unrelated: "retained" },
        },
      ],
    });
    const { result } = renderHook(() => useBreadcrumbs("Skill", []), {
      wrapper: ({ children }) => <Router history={history}>{children}</Router>,
    });
    expect(result.current.linkCrumbs.at(-1)).toEqual({
      title: "Skill",
      path: "/skills/4?tab=associations#details",
    });
    expect(result.current.to("/agents/2").state.breadcrumbs).toHaveLength(4);
    expect(result.current.breadcrumbs.at(-1)).toEqual({ title: "Skill" });
  });

  it("ignores malformed and external ancestor paths", () => {
    const history = createMemoryHistory({
      initialEntries: [
        {
          pathname: "/skills/4",
          state: {
            breadcrumbs: [
              null,
              { title: "External", path: "//example.com" },
              { title: "Missing", path: 7 },
              trail[0],
            ],
          },
        },
      ],
    });
    const { result } = renderHook(() => useBreadcrumbs("Skill", []), {
      wrapper: ({ children }) => <Router history={history}>{children}</Router>,
    });
    expect(result.current.breadcrumbs).toEqual([trail[0], { title: "Skill" }]);
  });

  it("URL-backed table and tab changes preserve all location state and the anchor", () => {
    const state = {
      breadcrumbs: trail.slice(0, 3),
      unrelated: { selection: 7 },
    };
    const history = createMemoryHistory({
      initialEntries: [
        {
          pathname: "/skills/4",
          search: "?tab=details",
          hash: "#details",
          state,
        },
      ],
    });
    // The hook reads document.location for query merging, so match the memory route in jsdom.
    window.history.replaceState({}, "", "/skills/4?tab=details#details");
    const { result } = renderHook(
      () =>
        useUrlParams<string, "", "tab">({
          keys: ["tab"],
          defaultValue: "details",
          serialize: (tab) => ({ tab }),
          deserialize: ({ tab }) => tab ?? "details",
        }),
      {
        wrapper: ({ children }) => (
          <Router history={history}>{children}</Router>
        ),
      }
    );
    act(() => result.current[1]("associations"));
    expect(history.location.state).toEqual(state);
    expect(history.location.hash).toBe("#details");
    expect(history.location.search).toBe("?tab=associations");
  });
});
