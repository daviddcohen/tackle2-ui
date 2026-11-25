import * as React from "react";
import { MemoryRouter } from "react-router-dom";

import { SkillOrigin } from "@app/agentic";
import { breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { render, screen } from "@app/test-config/test-utils";

import {
  SkillOriginList,
  formatSkillOrigin,
  linkToPath,
  searchWithFrom,
} from "./skill-origin";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const agent: SkillOrigin = {
  kind: "agent",
  agent: { id: "7", name: "Java Code Migrator" },
};
const collection: SkillOrigin = {
  kind: "collection",
  agent: { id: "7", name: "Java Code Migrator" },
  collection: { id: "c1", name: "Java modernization foundation" },
};
const archetype: SkillOrigin = {
  kind: "archetype",
  archetype: { id: 1, name: "Java EE Application" },
};
const targetProfile: SkillOrigin = {
  kind: "targetProfile",
  targetProfile: { id: 11, name: "Quarkus 3.x" },
  archetype: { id: 1, name: "Java EE Application" },
};
const application: SkillOrigin = {
  kind: "application",
  application: { id: 3, name: "Claims Processing" },
};

describe("formatSkillOrigin", () => {
  it("names each kind and links it where it is edited", () => {
    expect(formatSkillOrigin(agent)).toEqual({
      i18nKey: "agentic.stageSkills.origin.agent",
      values: { name: "Java Code Migrator" },
      path: "/agents/7",
    });
    expect(formatSkillOrigin(collection)).toEqual({
      i18nKey: "agentic.stageSkills.origin.collection",
      values: { name: "Java modernization foundation" },
      path: "/skills/collections/c1",
    });
    expect(formatSkillOrigin(archetype)).toEqual({
      i18nKey: "agentic.stageSkills.origin.archetype",
      values: { name: "Java EE Application" },
      // The archetype drawer, on its Skills tab.
      path: "/archetypes?ar%3AactiveItem=1",
    });
    expect(formatSkillOrigin(application)).toEqual({
      i18nKey: "agentic.stageSkills.origin.application",
      values: { name: "Claims Processing" },
      path: "/applications/3?tab=skills",
    });
  });

  it("names a target profile with its archetype", () => {
    expect(formatSkillOrigin(targetProfile)).toEqual({
      i18nKey: "agentic.stageSkills.origin.targetProfileWithArchetype",
      values: { name: "Quarkus 3.x", archetype: "Java EE Application" },
      path: "/archetypes/1/target-profiles#target-profile-11",
    });
  });

  it("says This application, without a link, only on that application", () => {
    expect(formatSkillOrigin(application, { thisApplicationId: 3 })).toEqual({
      i18nKey: "agentic.stageSkills.origin.thisApplication",
      values: {},
    });
    expect(
      formatSkillOrigin(application, { thisApplicationId: 4 }).i18nKey
    ).toBe("agentic.stageSkills.origin.application");
  });
});

describe("linkToPath", () => {
  it("passes the query and the hash as the search", () => {
    const linkTo = jest.fn((pathname: string, search: string) => ({
      pathname,
      search,
    }));
    linkToPath(linkTo, "/archetypes/1/target-profiles#target-profile-11");
    expect(linkTo).toHaveBeenLastCalledWith(
      "/archetypes/1/target-profiles",
      "#target-profile-11"
    );
    linkToPath(linkTo, "/applications/3?tab=skills");
    expect(linkTo).toHaveBeenLastCalledWith("/applications/3", "?tab=skills");
    linkToPath(linkTo, "/agents/7");
    expect(linkTo).toHaveBeenLastCalledWith("/agents/7", "");
  });
});

describe("searchWithFrom", () => {
  it("adds the origin and keeps the drawer query and the anchor", () => {
    expect(searchWithFrom("", "run-4")).toBe("?from=run-4");
    expect(searchWithFrom("?ar%3AactiveItem=1", "run-4")).toBe(
      "?ar%3AactiveItem=1&from=run-4"
    );
    expect(searchWithFrom("#target-profile-11", "plan-1")).toBe(
      "?from=plan-1#target-profile-11"
    );
    expect(searchWithFrom("?tab=skills&from=old", "run-4")).toBe(
      "?tab=skills&from=run-4"
    );
  });
});

describe("SkillOriginList", () => {
  const linkTo = (pathname: string, search = "") => `${pathname}${search}`;

  it("renders one line per origin, the archetype outside the link", () => {
    render(
      <MemoryRouter>
        <SkillOriginList
          origins={[agent, collection, targetProfile]}
          linkTo={linkTo}
        />
      </MemoryRouter>
    );
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual([
      "Agent: Java Code Migrator",
      "Collection: Java modernization foundation",
      "Target profile: Quarkus 3.x (Java EE Application)",
    ]);
    expect(
      screen.getByRole("link", { name: "Java Code Migrator" })
    ).toHaveAttribute("href", "/agents/7");
    expect(screen.getByRole("link", { name: "Quarkus 3.x" })).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-11"
    );
    expect(screen.queryByRole("link", { name: /Java EE Application/ })).toBe(
      null
    );
  });

  it("keeps the drawer query and the anchor with a from-merging linkTo", () => {
    // How a run page links: its own ?from= merged with the path's search.
    const fromLinkTo = (pathname: string, search: string) =>
      breadcrumbTo(pathname, searchWithFrom(search, "run-4"), []);
    render(
      <MemoryRouter>
        <SkillOriginList
          origins={[archetype, targetProfile]}
          linkTo={fromLinkTo}
        />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("link", { name: "Java EE Application" })
    ).toHaveAttribute("href", "/archetypes?ar%3AactiveItem=1&from=run-4");
    expect(screen.getByRole("link", { name: "Quarkus 3.x" })).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles?from=run-4#target-profile-11"
    );
  });

  it("is plain text without linkTo, and This application never links", () => {
    const { rerender } = render(
      <MemoryRouter>
        <SkillOriginList origins={[agent, archetype]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Java Code Migrator")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();

    rerender(
      <MemoryRouter>
        <SkillOriginList
          origins={[application]}
          options={{ thisApplicationId: 3 }}
          linkTo={linkTo}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("This application");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
