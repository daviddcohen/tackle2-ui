import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { Agent } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { AgentDetailsTab } from "./agent-details-tab";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const LINE_HEIGHT = 20;

const agentWithPrompt = (paragraphs: number): Agent => ({
  id: "7",
  name: "Code Migrator",
  description: "Migrates code.",
  model: { id: "1", name: "Approved Model" },
  skills: [],
  prompt: Array.from(
    { length: paragraphs },
    (_, index) => `Paragraph ${index + 1}.`
  ).join("\n"),
  capabilities: [],
  parameters: [],
});

const renderTab = (agent: Agent) =>
  render(
    <MemoryRouter>
      <AgentDetailsTab
        agent={agent}
        plansUsingAgent={[]}
        isLoadingPlans={false}
        plansError={null}
        linkCrumbs={[]}
      />
    </MemoryRouter>
  );

describe("AgentDetailsTab persona prompt", () => {
  // jsdom has no layout: give every paragraph one line, so the truncate
  // variant of ExpandableSection can count the prompt's lines.
  beforeEach(() => {
    jest
      .spyOn(Element.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: Element) {
        return this.querySelectorAll("p").length * LINE_HEIGHT;
      });
    const getComputedStyle = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = getComputedStyle(element);
      return new Proxy(style, {
        get: (target, property) => {
          if (property === "lineHeight") return `${LINE_HEIGHT}px`;
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a prompt of up to 8 lines in full, without a toggle", () => {
    renderTab(agentWithPrompt(8));
    expect(screen.getByText("Paragraph 8.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("truncates a longer prompt to 8 lines with Show more / Show less (4.11)", async () => {
    renderTab(agentWithPrompt(12));
    const content = screen.getByText("Paragraph 1.").closest("p")?.parentElement
      ?.parentElement as HTMLElement;
    expect(
      content.style.getPropertyValue(
        "--pf-v6-c-expandable-section--m-truncate__content--LineClamp"
      )
    ).toBe("8");
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      screen.getByRole("button", { name: "Show less" })
    ).toBeInTheDocument();
  });
});
