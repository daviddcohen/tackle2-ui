import { MemoryRouter } from "react-router-dom";

import { ConfigurationCheck, ConfigurationCheckStatus } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import en from "../../../../../public/locales/en/translation.json";

import {
  ConfigurationStatus,
  MigrationStatus,
  RunStatus,
  StatusPresentation,
  VerificationStatusText,
  getConfigurationAggregate,
  preflightDisplayStatus,
  statusPresentation,
} from "./agentic-status";

// Each state has a fixed icon. The shared jest stub makes every icon the
// same component, so give each one its own, named after the import.
jest.mock("@patternfly/react-icons", () => {
  const { createElement } = jest.requireActual("react");
  const icons = new Map<string, React.FC>();
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === "__esModule") return true;
        const key = String(name);
        if (!icons.has(key)) {
          const Icon: React.FC = (props) =>
            createElement("test-file-stub", props);
          Icon.displayName = key.replace(/Icon$/, "");
          icons.set(key, Icon);
        }
        return icons.get(key);
      },
    }
  );
});

type Strings = { [key: string]: string | Strings };

/** The English text of a presentation, as users read it (plural: `_other`). */
const english = ({ labelKey }: StatusPresentation) => {
  const path = labelKey.split(".");
  const leaf = path.pop() as string;
  const parent = path.reduce(
    (node, part) => node[part] as Strings,
    en as Strings
  );
  return parent[leaf] ?? parent[`${leaf}_other`];
};

const rows = (section: Record<string, StatusPresentation>) =>
  Object.entries(section).map(([value, presentation]) => [
    value,
    english(presentation),
    presentation.status ?? "none",
    presentation.icon.displayName,
  ]);

describe("statusPresentation", () => {
  it("run and stage: Action required is the only name for a human must act", () => {
    expect(rows(statusPresentation.run)).toEqual([
      ["Pending", "Pending", "none", "Pending"],
      ["Running", "Running", "info", "InProgress"],
      ["Succeeded", "Succeeded", "success", "CheckCircle"],
      ["Failed", "Failed", "danger", "ExclamationCircle"],
      ["AwaitingApproval", "Action required", "warning", "ExclamationTriangle"],
    ]);
  });

  it("application migration: Blocked and the not-started states are neutral", () => {
    expect(rows(statusPresentation.migration)).toEqual([
      ["notConfigured", "Not configured", "none", "MinusCircle"],
      ["preflightReady", "Ready to start", "none", "NotStarted"],
      ["preflightBlocked", "Blocked", "none", "Ban"],
      [
        "reviewRequired",
        "Review before start",
        "warning",
        "ExclamationTriangle",
      ],
      ["pending", "Pending", "none", "Pending"],
      ["running", "Running", "info", "InProgress"],
      ["actionRequired", "Action required", "warning", "ExclamationTriangle"],
      ["succeeded", "Succeeded", "success", "CheckCircle"],
      ["failed", "Failed", "danger", "ExclamationCircle"],
    ]);
  });

  it("shares one presentation between run phases and migration states", () => {
    expect(statusPresentation.migration.pending).toBe(
      statusPresentation.run.Pending
    );
    expect(statusPresentation.migration.actionRequired).toBe(
      statusPresentation.run.AwaitingApproval
    );
    expect(statusPresentation.migration.failed).toBe(
      statusPresentation.run.Failed
    );
  });

  it("verification", () => {
    expect(rows(statusPresentation.verification)).toEqual([
      ["verified", "Verified", "success", "CheckCircle"],
      ["pending", "Pending", "none", "Pending"],
      ["unreachable", "Unreachable", "danger", "ExclamationCircle"],
    ]);
  });

  it("configuration checks and their aggregate", () => {
    expect(rows(statusPresentation.configuration)).toEqual([
      ["passed", "Passed", "success", "CheckCircle"],
      ["issue", "Issue", "warning", "ExclamationTriangle"],
      ["notEvaluated", "Not evaluated", "none", "MinusCircle"],
      ["checksPassed", "Checks passed", "success", "CheckCircle"],
      ["issues", "{{count}} issues", "warning", "ExclamationTriangle"],
    ]);
  });

  it("maps a preflight outcome to its migration status", () => {
    expect(preflightDisplayStatus).toEqual({
      ready: "preflightReady",
      blocked: "preflightBlocked",
      reviewRequired: "reviewRequired",
    });
  });
});

describe("getConfigurationAggregate", () => {
  const checks = (...statuses: ConfigurationCheckStatus[]) =>
    statuses.map<ConfigurationCheck>((status, index) => ({
      id: `check-${index}`,
      labelKey: `check-${index}`,
      status,
      detailKey: "detail",
    }));

  it.each<[ConfigurationCheckStatus[], string]>([
    [["passed", "passed"], "checksPassed"],
    [["passed", "issue", "notEvaluated"], "issues"],
    [["passed", "notEvaluated"], "notEvaluated"],
    [[], "checksPassed"],
  ])("%j gives %s", (statuses, expected) => {
    expect(getConfigurationAggregate(checks(...statuses))).toBe(expected);
  });
});

describe("status components", () => {
  it("render an icon and text, never a colored label", () => {
    const { container } = render(<RunStatus status="Failed" />);
    expect(screen.getByText("agentic.runStatus.failed")).toBeInTheDocument();
    expect(container.querySelector(".pf-v6-c-icon__content")).toHaveClass(
      "pf-m-danger"
    );
    expect(container.querySelector(".pf-v6-c-label")).toBeNull();
  });

  it("keep a neutral status grey", () => {
    const { container } = render(<MigrationStatus status="preflightBlocked" />);
    expect(
      screen.getByText("agentic.migrationStatus.preflightBlocked")
    ).toBeInTheDocument();
    const icon = container.querySelector(".pf-v6-c-icon__content");
    expect(icon).not.toHaveClass("pf-m-danger");
    expect(icon).not.toHaveClass("pf-m-warning");
    expect(icon).not.toHaveClass("pf-m-info");
  });

  it("put the reason on a subtle second line", () => {
    render(
      <MigrationStatus
        status="preflightBlocked"
        supportingText="Run #2 is already running for this application."
      />
    );
    const reason = screen.getByText(
      "Run #2 is already running for this application."
    );
    expect(reason).toHaveClass("pf-v6-u-text-color-subtle");
    expect(reason.tagName).toBe("SMALL");
  });

  it("render no second line for an empty reason", () => {
    const { container } = render(
      <VerificationStatusText status="verified" supportingText="" />
    );
    expect(container.querySelector("small")).toBeNull();
  });

  it("link the status text itself when given a target", () => {
    render(
      <MemoryRouter>
        <MigrationStatus status="running" to="/applications/1?tab=migration" />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("link", { name: "agentic.runStatus.running" })
    ).toHaveAttribute("href", "/applications/1?tab=migration");
    expect(screen.getAllByText("agentic.runStatus.running")).toHaveLength(1);
  });

  it("render the aggregate of a plan's checks", () => {
    const { container } = render(
      <ConfigurationStatus
        checks={[
          { id: "a", labelKey: "a", status: "issue", detailKey: "d" },
          { id: "b", labelKey: "b", status: "passed", detailKey: "d" },
        ]}
      />
    );
    expect(
      screen.getByText("agentic.configurationStatus.issues")
    ).toBeInTheDocument();
    expect(container.querySelector(".pf-v6-c-icon__content")).toHaveClass(
      "pf-m-warning"
    );
  });

  it("show a value outside the domain as itself instead of failing", () => {
    render(<RunStatus status={"Paused" as never} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });
});
