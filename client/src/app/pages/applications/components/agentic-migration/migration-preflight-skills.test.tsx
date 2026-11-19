jest.unmock("react-router-dom");

import { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { rest } from "msw";
import { Router } from "react-router-dom";

import {
  ApplicationMigrationMap,
  ApplicationMigrationView,
  EffectiveSkillAssociation,
  MigrationPlan,
} from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { MigrationPreflightModal } from "./migration-preflight-modal";

// The skills preview of the Run migration plan dialog, in English
// (migration-preflight-modal.test.tsx covers the rest of the dialog).
jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const skill = (
  id: string,
  name: string,
  scope: EffectiveSkillAssociation["scope"] = "agent",
  scopeName = "Code Migrator"
): EffectiveSkillAssociation => ({ skill: { id, name }, scope, scopeName });

const view = (
  overrides: Partial<ApplicationMigrationView> = {}
): ApplicationMigrationView => ({
  configured: true,
  intervention: "none",
  stages: [],
  preflight: "ready",
  plan: { id: "5", name: "Legacy Java to RHEL" },
  effectiveSkills: [
    skill("1", "Quarkus patterns"),
    skill("2", "Java EE migration"),
  ],
  ...overrides,
});

const withOneExcluded = view({
  excludedSkills: [
    skill("8", "Containerization standards", "archetype", "Java EE"),
  ],
});

const plans: MigrationPlan[] = [
  { id: "5", name: "Legacy Java to RHEL", description: "", stages: [] },
];

const application = { id: 13, name: "Branch Operations" };

const renderModal = (
  migrations: ApplicationMigrationMap | undefined,
  props: Partial<ComponentProps<typeof MigrationPreflightModal>> = {}
) =>
  render(
    <Router history={createMemoryHistory()}>
      <MigrationPreflightModal
        applications={[application]}
        migrations={migrations}
        linkTo={(pathname) => pathname}
        onClose={jest.fn()}
        onStartReady={jest.fn()}
        {...props}
      />
    </Router>
  );

const STANDARD =
  "Skills the agents use when migrating this application, and where each one comes from.";
const NEUTRAL =
  "Skills for migrating this application and where each one comes from.";
const EXCLUDED =
  "Its migration plan excludes the skills marked Excluded, so they are not given to the agents.";
const RERUN =
  "The new run uses the migration plan as it is now, so these skills can differ from the failed run's.";
const NOT_PREVIEWED = /not previewed/;

// Responses a test holds open are released after it, so no pending handler
// keeps the process alive once the suite ends.
const heldResponses: (() => void)[] = [];
const holdResponse = () =>
  new Promise<void>((resolve) => heldResponses.push(resolve));
afterEach(() => heldResponses.splice(0).forEach((release) => release()));

const skillsToggle = (name: string | RegExp = /^Skills/) =>
  screen.getByRole("button", { name });

// The form validates on mount (react-hook-form with a yup resolver), which
// updates the dialog after the first render. Tests that check only the first
// render wait for it, so no update lands after the test ends.
const validated = () =>
  waitFor(() =>
    expect(screen.getByRole("button", { name: /^Run on / })).toBeEnabled()
  );

describe("MigrationPreflightModal, skills of one application", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.plans, (_req, res, ctx) =>
        res(ctx.json(plans))
      )
    );
  });

  it("starts collapsed, with the count in the toggle", async () => {
    renderModal({ 13: view() });
    await validated();
    const toggle = skillsToggle("Skills (2)");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("grid", { name: "Skills" })).toBeNull();
  });

  it("expands to the sentence and the shared table, skill names as plain text", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() });
    await user.click(skillsToggle("Skills (2)"));
    expect(skillsToggle("Skills (2)")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(STANDARD)).toBeInTheDocument();
    const table = screen.getByRole("grid", { name: "Skills" });
    // A link would close the dialog and lose its choices, as in the wizard.
    expect(within(table).getByText("Quarkus patterns")).toBeInTheDocument();
    expect(within(table).queryByRole("link")).toBeNull();
    expect(within(table).queryByText("Excluded")).toBeNull();
  });

  it("counts what is used and marks the excluded skill in name order", async () => {
    const user = userEvent.setup();
    renderModal({ 13: withOneExcluded });
    await user.click(skillsToggle("Skills (2 of 3 used)"));
    expect(screen.getByText(`${NEUTRAL} ${EXCLUDED}`)).toBeInTheDocument();
    const rows = within(screen.getByRole("grid", { name: "Skills" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Containerization standardsExcludedArchetype: Java EE",
      "Java EE migrationAgent: Code Migrator",
      "Quarkus patternsAgent: Code Migrator",
    ]);
  });

  it("counts several excluded skills, down to none used", async () => {
    renderModal({
      13: view({
        effectiveSkills: [],
        excludedSkills: [
          skill("1", "Quarkus patterns"),
          skill("2", "Java EE migration"),
        ],
      }),
    });
    await validated();
    expect(skillsToggle("Skills (0 of 2 used)")).toBeInTheDocument();
  });

  it("says a rerun resolves the skills again, in place of the standard sentence", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view() }, { rerunPlanId: "5" });
    const toggle = skillsToggle("Skills (2)");
    // Collapsed on a rerun too.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText(RERUN)).toBeInTheDocument();
    expect(screen.queryByText(STANDARD)).toBeNull();
  });

  it("keeps the excluded sentence on a rerun", async () => {
    const user = userEvent.setup();
    renderModal({ 13: withOneExcluded }, { rerunPlanId: "5" });
    await user.click(skillsToggle("Skills (2 of 3 used)"));
    expect(
      screen.getByText(
        `${RERUN} The migration plan excludes the skills marked Excluded, so they are not given to the agents.`
      )
    ).toBeInTheDocument();
  });

  it("drops the preview, with no note, when one plan is picked for all, and restores it as it was", async () => {
    const user = userEvent.setup();
    renderModal({ 13: withOneExcluded });
    await user.click(skillsToggle("Skills (2 of 3 used)"));
    await user.click(
      screen.getByRole("radio", {
        name: /^Use one migration plan for all applications/,
      })
    );
    expect(screen.queryByText(NOT_PREVIEWED)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Skills/ })).toBeNull();

    await user.click(
      screen.getByRole("radio", { name: /^Use each application's/ })
    );
    expect(skillsToggle("Skills (2 of 3 used)")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.queryByText(NOT_PREVIEWED)).toBeNull();
  });

  it("comes after the plan choice, so hiding it moves nothing above it", async () => {
    renderModal({ 13: view() });
    await validated();
    const lastRadio = screen.getByRole("radio", {
      name: /^Use one migration plan for all applications/,
    });
    expect(
      lastRadio.compareDocumentPosition(skillsToggle("Skills (2)")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows no preview on a rerun that starts with one plan for all", async () => {
    renderModal(
      { 13: view() },
      { rerunPlanId: "5", initialValues: { planSelection: "single" } }
    );
    // The Run button stays disabled (no plan picked): let the validation on
    // mount finish.
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /^Skills/ })).toBeNull();
    expect(screen.queryByText(NOT_PREVIEWED)).toBeNull();
  });

  it("says Unavailable, without a count, when the server gives no skills", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view({ effectiveSkills: undefined }) });
    await user.click(skillsToggle("Skills"));
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "Skills" })).toBeNull();
  });

  it("says no skills are associated when the set is empty", async () => {
    const user = userEvent.setup();
    renderModal({ 13: view({ effectiveSkills: [] }) });
    await user.click(skillsToggle("Skills"));
    expect(
      screen.getByText(
        "No skills are associated with this application's migration plan, archetype, target profile or the application."
      )
    ).toBeInTheDocument();
  });

  it("shows nothing while the application's view loads", async () => {
    server.use(
      rest.get(
        AGENTIC_ENDPOINTS.applicationMigrations,
        async (_req, res, ctx) => {
          await holdResponse();
          return res(ctx.json({}));
        }
      )
    );
    renderModal(undefined);
    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Skills/ })).toBeNull();
  });

  it("shows nothing when the application is not ready", async () => {
    renderModal({
      13: view({ preflight: "blocked", preflightReason: "No credentials." }),
    });
    // No Run button to wait for: let the validation on mount finish.
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /^Skills/ })).toBeNull();
    expect(screen.queryByText(NOT_PREVIEWED)).toBeNull();
  });

  it("shows nothing for several applications, whichever plan is picked", async () => {
    const user = userEvent.setup();
    renderModal(
      { 13: withOneExcluded, 14: view() },
      {
        applications: [application, { id: 14, name: "Claims Processing" }],
      }
    );
    expect(screen.queryByRole("button", { name: /^Skills/ })).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Skills" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("radio", {
        name: /^Use one migration plan for all applications/,
      })
    );
    expect(screen.queryByText(NOT_PREVIEWED)).toBeNull();
  });
});
