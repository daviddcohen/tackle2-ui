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
});
