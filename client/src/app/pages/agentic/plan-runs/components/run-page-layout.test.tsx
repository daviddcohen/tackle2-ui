import * as React from "react";
import userEvent from "@testing-library/user-event";
import { Location } from "history";
import { MemoryRouter, Route } from "react-router-dom";

import { render, screen } from "@app/test-config/test-utils";

import { DetailSection } from "../../components/detail-section";

import { RunPageBody, StageApplicationRow } from "./run-page-layout";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);
jest.mock("react-router-dom", () => jest.requireActual("react-router-dom"));

/** A section with local state, like an expanded "Show output". */
const Expandable: React.FC = () => {
  const [isExpanded, setExpanded] = React.useState(false);
  return (
    <button type="button" onClick={() => setExpanded(true)}>
      {isExpanded ? "Expanded" : "Collapsed"}
    </button>
  );
};

describe("run page stacks", () => {
  it("keeps a section's state when an earlier child appears", async () => {
    const Page: React.FC<{ hasAlert: boolean }> = ({ hasAlert }) => (
      <RunPageBody>
        {hasAlert && <p>Alert</p>}
        <p>Facts</p>
        <Expandable />
      </RunPageBody>
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
});

const renderRow = (applications: { id: number; name: string }[]) => {
  let location: Location | undefined;
  const result = render(
    <MemoryRouter initialEntries={["/plan-runs/1/stages/2"]}>
      <StageApplicationRow
        applications={applications}
        runId="1"
        linkCrumbs={[
          { title: "Plan runs", path: "/plan-runs" },
          { title: "Run #1", path: "/plan-runs/1" },
          { title: "Migrate", path: "/plan-runs/1/stages/2" },
        ]}
      />
      <Route
        render={(props) => {
          location = props.location;
          return null;
        }}
      />
    </MemoryRouter>
  );
  return { ...result, location: () => location };
};

describe("StageApplicationRow", () => {
  it("names one application with the singular label", () => {
    renderRow([{ id: 7, name: "Partner Events API" }]);
    const link = screen.getByRole("link", { name: "Partner Events API" });
    expect(link).toHaveAttribute("href", "/applications/7");
    expect(link.parentElement).toHaveTextContent(
      /^Application: Partner Events API$/
    );
  });

  it("lists several applications with the plural label, joined by commas", () => {
    renderRow([
      { id: 1, name: "Claims Processing" },
      { id: 2, name: "Underwriting Workbench" },
    ]);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/applications/1",
      "/applications/2",
    ]);
    expect(links[0].parentElement).toHaveTextContent(
      /^Applications: Claims Processing, Underwriting Workbench$/
    );
  });

  it("keeps the trail on its links", async () => {
    const { location } = renderRow([{ id: 1, name: "Claims Processing" }]);
    await userEvent.click(
      screen.getByRole("link", { name: "Claims Processing" })
    );
    expect(location()?.pathname).toBe("/applications/1");
    expect(
      (
        location()?.state as { breadcrumbs: { title: string }[] }
      ).breadcrumbs.map((crumb) => crumb.title)
    ).toEqual(["Plan runs", "Run #1", "Migrate"]);
  });

  it("counts more than five applications in one link to the run, keeping the trail", async () => {
    const { location } = renderRow(
      Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        name: `App ${index + 1}`,
      }))
    );
    const link = screen.getByRole("link", { name: "6 applications" });
    expect(link).toHaveAttribute("href", "/plan-runs/1");
    expect(link.parentElement).toHaveTextContent(/^6 applications$/);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    await userEvent.click(link);
    expect(location()?.pathname).toBe("/plan-runs/1");
    // The run is an ancestor in the trail: the trail is cut back to it.
    expect(
      (
        location()?.state as { breadcrumbs: { title: string }[] }
      ).breadcrumbs.map((crumb) => crumb.title)
    ).toEqual(["Plan runs"]);
  });

  it("renders nothing without applications", () => {
    const { container } = renderRow([]);
    expect(container).toBeEmptyDOMElement();
  });
});
