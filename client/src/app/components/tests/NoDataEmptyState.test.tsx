import { Button } from "@patternfly/react-core";

import { render, screen } from "@app/test-config/test-utils";

import { NoDataEmptyState } from "../NoDataEmptyState";

describe("NoDataEmptyState", () => {
  it("Renders without crashing", () => {
    const wrapper = render(
      <NoDataEmptyState title="my title" description="my description" />
    );
    expect(wrapper).toMatchSnapshot();
  });

  it("renders no footer without actions", () => {
    const { container } = render(<NoDataEmptyState title="my title" />);
    expect(
      container.querySelector(".pf-v6-c-empty-state__footer")
    ).not.toBeInTheDocument();
  });

  it("renders the actions in the empty state footer", () => {
    const { container } = render(
      <NoDataEmptyState
        title="No agents yet"
        description="Create an agent to get started."
        actions={<Button variant="primary">Create agent</Button>}
      />
    );
    const button = screen.getByRole("button", { name: "Create agent" });
    expect(
      container.querySelector(
        ".pf-v6-c-empty-state__footer .pf-v6-c-empty-state__actions"
      )
    ).toContainElement(button);
  });
});
