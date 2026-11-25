import * as React from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { render, screen } from "@app/test-config/test-utils";

import {
  DetailFacts,
  DetailSection,
  DetailSections,
  LinkLabels,
} from "./detail-section";

/** A section with local state, like an expanded "Show output". */
const Expandable: React.FC = () => {
  const [isExpanded, setExpanded] = React.useState(false);
  return (
    <button type="button" onClick={() => setExpanded(true)}>
      {isExpanded ? "Expanded" : "Collapsed"}
    </button>
  );
};

describe("detail page stacks", () => {
  it("keeps a section's state when an earlier child appears and goes", async () => {
    const Page: React.FC<{ hasAlert: boolean }> = ({ hasAlert }) => (
      <DetailSections>
        {hasAlert && <p>Alert</p>}
        <p>Facts</p>
        <Expandable />
      </DetailSections>
    );
    const { rerender } = render(<Page hasAlert={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapsed" }));

    rerender(<Page hasAlert />);
    expect(screen.getByText("Alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expanded" })).toBeVisible();

    rerender(<Page hasAlert={false} />);
    expect(screen.queryByText("Alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expanded" })).toBeVisible();
  });

  it("keeps a section's state when an earlier section child goes", async () => {
    const Section: React.FC<{ hasDetail: boolean }> = ({ hasDetail }) => (
      <DetailSection title="Activity">
        {hasDetail && <p>Detail</p>}
        <Expandable />
      </DetailSection>
    );
    const { rerender } = render(<Section hasDetail />);
    await userEvent.click(screen.getByRole("button", { name: "Collapsed" }));

    rerender(<Section hasDetail={false} />);
    expect(screen.queryByText("Detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expanded" })).toBeVisible();
  });

  it("renders the heading, its sentence and the section anchor", () => {
    const { container } = render(
      <DetailSection
        id="commits"
        title="Commits (2)"
        description="Newest first."
      >
        <p>Rows</p>
      </DetailSection>
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Commits (2)" })
    ).toBeVisible();
    expect(screen.getByText("Newest first.")).toHaveClass(
      "pf-v6-u-text-color-subtle"
    );
    expect(container.querySelector("#commits")).not.toBeNull();
    // Without a heading id it stays a plain block, as before.
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders a sub-section heading at h3 size md, with a node title", () => {
    render(
      <MemoryRouter>
        <DetailSection
          headingLevel="h3"
          title={
            <>
              Archetype skills: <a href="/archetypes/1">Java EE</a> (2)
            </>
          }
        >
          <p>Rows</p>
        </DetailSection>
      </MemoryRouter>
    );
    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Archetype skills: Java EE (2)",
    });
    expect(heading).toHaveClass("pf-m-md");
    expect(screen.getByRole("link", { name: "Java EE" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("names the section by its heading, which a script can focus", () => {
    render(
      <DetailSection
        headingId="skills-by-stage-heading"
        title="Skills by stage"
      >
        <p>Rows</p>
      </DetailSection>
    );
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Skills by stage",
    });
    expect(heading).toHaveAttribute("id", "skills-by-stage-heading");
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveClass("pf-m-lg");
    expect(
      screen.getByRole("region", { name: "Skills by stage" })
    ).toContainElement(screen.getByText("Rows"));
    heading.focus();
    expect(heading).toHaveFocus();
  });
  it("puts the actions on the heading's line, only when given", () => {
    const { rerender } = render(
      <DetailSection
        title="Skills (2)"
        actions={<button type="button">Manage skills</button>}
      >
        <p>Rows</p>
      </DetailSection>
    );
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Skills (2)",
    });
    const action = screen.getByRole("button", { name: "Manage skills" });
    expect(heading.closest(".pf-v6-l-split")).toContainElement(action);

    rerender(
      <DetailSection title="Skills (2)">
        <p>Rows</p>
      </DetailSection>
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen
        .getByRole("heading", { level: 2, name: "Skills (2)" })
        .closest(".pf-v6-l-split")
    ).toBeNull();
  });
});

describe("DetailFacts and LinkLabels", () => {
  it("renders each fact as a term and its value", () => {
    render(
      <DetailFacts
        facts={[
          ["Model", "Claude"],
          ["Skills", <span key="skills">None</span>],
        ]}
      />
    );
    expect(screen.getByText("Model")).toBeVisible();
    expect(screen.getByText("Claude")).toBeVisible();
    expect(screen.getByText("None")).toBeVisible();
  });

  it("adds a term's help after the term, only when given", () => {
    render(
      <DetailFacts
        facts={[
          ["Model", "Claude"],
          [
            "Context window",
            "61%",
            {
              termHelp: <button type="button" aria-label="More information" />,
            },
          ],
        ]}
      />
    );
    const [model, context] = screen.getAllByRole("term");
    expect(model.querySelector("button")).toBeNull();
    expect(context.textContent).toBe("Context window ");
    expect(context).toContainElement(
      screen.getByRole("button", { name: "More information" })
    );
    expect(screen.getByText("61%")).toBeVisible();
  });

  it("renders each item as a link label", () => {
    render(
      <MemoryRouter>
        <LinkLabels
          items={[
            { id: 1, name: "Code Migrator", to: "/agents/1" },
            { id: 2, name: "Test Runner", to: "/agents/2" },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Code Migrator" })).toHaveAttribute(
      "href",
      "/agents/1"
    );
    expect(screen.getByRole("link", { name: "Test Runner" })).toHaveAttribute(
      "href",
      "/agents/2"
    );
  });

  it("shows five labels, then our translated N more that expands to Show less", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LinkLabels
          items={[1, 2, 3, 4, 5, 6, 7].map((id) => ({
            id,
            name: `Skill ${id}`,
            to: `/skills/${id}`,
          }))}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("link")).toHaveLength(5);
    // The test i18n renders keys: these are ours, not PatternFly's
    // untranslated "2 more" and "Show Less".
    await user.click(screen.getByRole("button", { name: "terms.moreCount" }));
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(
      screen.getByRole("button", { name: "terms.showLess" })
    ).toBeVisible();
  });

  it("renders an item without a destination as a plain label", () => {
    render(
      <MemoryRouter>
        <LinkLabels
          items={[
            { id: 1, name: "Code Migrator", to: "/agents/1" },
            { id: 2, name: "Quarkus 3.x" },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Quarkus 3.x")).toBeVisible();
  });
});
