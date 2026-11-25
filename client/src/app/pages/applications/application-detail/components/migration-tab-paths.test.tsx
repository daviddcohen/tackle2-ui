jest.unmock("react-router-dom");

import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { ApplicationMigrationView } from "@app/agentic";
import { render, screen, within } from "@app/test-config/test-utils";

import { DecoratedApplication } from "../../useDecoratedApplications";

import { MigrationTab } from "./migration-tab";

// The Target profiles fact in English, so its links and words can be read.
jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const javaEE = { id: 1, name: "Java EE Application" };
const mockMigration: ApplicationMigrationView = {
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  migrationPaths: [
    {
      archetype: javaEE,
      targetProfile: { id: 11, name: "Quarkus 3.x" },
      plan: { id: "1", name: "Java EE to Quarkus" },
    },
    {
      archetype: javaEE,
      targetProfile: { id: 12, name: "OpenJDK 21 on OpenShift" },
      plan: { id: "3", name: "Java lift and shift" },
    },
    { archetype: javaEE, targetProfile: { id: 13, name: "Payara 6" } },
  ],
};

jest.mock("@app/queries/agentic", () => ({
  useFetchApplicationMigrations: () => ({
    migrations: { 1: mockMigration },
    isLoading: false,
    fetchError: null,
  }),
  useFetchPlanRun: () => ({
    planRun: undefined,
    isLoading: false,
    fetchError: null,
  }),
  useFetchPlanRuns: () => ({
    planRuns: [],
    isLoading: false,
    fetchError: null,
  }),
  useResolveApplicationMigrationRequestMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@app/pages/agentic/components/run-migration-plan-launcher", () => ({
  useRunMigrationPlanLauncher: () => ({ open: undefined, modal: null }),
}));

const javaEEPaths = mockMigration.migrationPaths;

const renderTab = (archetypes = [javaEE]) => {
  render(
    <Router history={createMemoryHistory()}>
      <MigrationTab
        application={
          {
            id: 1,
            name: "Customer Management",
            archetypes,
          } as DecoratedApplication
        }
        applicationId={1}
        linkCrumbs={[]}
      />
    </Router>
  );
  return screen
    .getByText("Target profiles")
    .closest(".pf-v6-c-description-list__group") as HTMLElement;
};

describe("MigrationTab with several target profiles and no default", () => {
  afterEach(() => {
    mockMigration.migrationPaths = javaEEPaths;
  });

  it("lists each target profile with its plan, both linked, without repeating the one archetype", () => {
    const fact = renderTab();
    const items = within(fact).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Quarkus 3.x: Java EE to Quarkus",
      "OpenJDK 21 on OpenShift: Java lift and shift",
      "Payara 6: Not assigned",
    ]);
    expect(
      within(items[1]).getByRole("link", { name: "OpenJDK 21 on OpenShift" })
    ).toHaveAttribute(
      "href",
      "/archetypes/1/target-profiles#target-profile-12"
    );
    expect(
      within(items[1]).getByRole("link", { name: "Java lift and shift" })
    ).toHaveAttribute("href", "/migration-plans/3");
    // A profile without a plan has no plan link.
    expect(within(items[2]).getAllByRole("link")).toHaveLength(1);
    expect(fact).toHaveTextContent(
      "Each run picks one of these target profiles and runs the migration plan it uses."
    );
  });

  it("names each profile's archetype when the paths span several", () => {
    const legacyJava = { id: 2, name: "Legacy Java Application" };
    mockMigration.migrationPaths = [
      javaEEPaths![0],
      {
        archetype: legacyJava,
        targetProfile: { id: 21, name: "Java 8 on OpenShift" },
        plan: { id: "3", name: "Java lift and shift" },
      },
    ];
    const fact = renderTab([javaEE, legacyJava]);
    expect(
      within(fact)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Quarkus 3.x (Java EE Application): Java EE to Quarkus",
      "Java 8 on OpenShift (Legacy Java Application): Java lift and shift",
    ]);
  });
});
