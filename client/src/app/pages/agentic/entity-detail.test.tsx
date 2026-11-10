import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "history";
import { Router } from "react-router-dom";

import { render, screen } from "@app/test-config/test-utils";

import {
  EntityDetailActions,
  EntityDetailLoading,
  EntityDetailUnavailable,
} from "./entity-detail";

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
  );
  return user;
};

const menuEntries = () =>
  Array.from(screen.getByRole("menu").querySelectorAll(":scope > li")).map(
    (li) => (li.getAttribute("role") === "separator" ? "---" : li.textContent)
  );

describe("EntityDetailActions", () => {
  it("lists Edit, then the items, a separator and Delete", async () => {
    const onTest = jest.fn();
    render(
      <EntityDetailActions
        items={[{ key: "test", label: "Test agent", onClick: onTest }]}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const user = await openMenu();

    expect(menuEntries()).toEqual([
      "actions.edit",
      "Test agent",
      "---",
      "actions.delete",
    ]);

    await user.click(screen.getByRole("menuitem", { name: "Test agent" }));
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  it("keeps working without items", async () => {
    const onEdit = jest.fn();
    render(<EntityDetailActions onEdit={onEdit} onDelete={jest.fn()} />);
    const user = await openMenu();

    expect(menuEntries()).toEqual(["actions.edit", "---", "actions.delete"]);
    await user.click(screen.getByRole("menuitem", { name: "actions.edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows only the entries whose handler is passed", async () => {
    const { unmount } = render(<EntityDetailActions onEdit={jest.fn()} />);
    await openMenu();
    expect(menuEntries()).toEqual(["actions.edit"]);
    unmount();

    render(<EntityDetailActions onDelete={jest.fn()} />);
    await openMenu();
    expect(menuEntries()).toEqual(["actions.delete"]);
  });

  it("renders nothing when no entry remains", () => {
    render(<EntityDetailActions />);
    expect(
      screen.queryByRole("button", {
        name: "agentic.applicationDetail.actions",
      })
    ).not.toBeInTheDocument();
  });

  it("marks Delete as danger only when it is enabled", async () => {
    const { unmount } = render(
      <EntityDetailActions onEdit={jest.fn()} onDelete={jest.fn()} />
    );
    await openMenu();
    expect(
      screen.getByRole("menuitem", { name: "actions.delete" }).closest("li")
    ).toHaveClass("pf-m-danger");
    unmount();

    const onDelete = jest.fn();
    render(
      <EntityDetailActions
        onEdit={jest.fn()}
        onDelete={onDelete}
        deleteDisabledReason="Used by 2 migration plans."
      />
    );
    const user = await openMenu();
    const deleteItem = screen.getByRole("menuitem", { name: "actions.delete" });
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem.closest("li")).not.toHaveClass("pf-m-danger");
    await user.click(deleteItem);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disables Edit and Delete with the managed reason, leaving the items", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const onTest = jest.fn();
    render(
      <EntityDetailActions
        items={[{ key: "test", label: "Test agent", onClick: onTest }]}
        onEdit={onEdit}
        onDelete={onDelete}
        deleteDisabledReason="Used by 2 migration plans."
        managedReason="Managed by Konveyor."
      />
    );
    const user = await openMenu();

    const editItem = screen.getByRole("menuitem", { name: "actions.edit" });
    const deleteItem = screen.getByRole("menuitem", { name: "actions.delete" });
    expect(editItem).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem.closest("li")).not.toHaveClass("pf-m-danger");
    await user.click(editItem);
    await user.click(deleteItem);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    // The managed reason wins over the in-use reason.
    await user.hover(deleteItem);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Managed by Konveyor."
    );

    await user.click(screen.getByRole("menuitem", { name: "Test agent" }));
    expect(onTest).toHaveBeenCalledTimes(1);
  });
});

const trail = [{ title: "Agents", path: "/agents" }, { title: "Agent" }];

describe("EntityDetailLoading", () => {
  it("keeps the trail with the noun leaf and shows a title skeleton", () => {
    render(
      <Router history={createMemoryHistory()}>
        <EntityDetailLoading breadcrumbs={trail} />
      </Router>
    );
    expect(screen.getByRole("link", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Agent")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("terms.loading").length).toBeGreaterThan(0);
  });
});

describe("EntityDetailUnavailable", () => {
  const props = {
    breadcrumbs: trail,
    notFoundTitle: "Agent not found",
    notFoundBody:
      "This agent may have been deleted, or the link is out of date.",
    backLabel: "Back to agents",
    backPath: "/agents",
  };

  it("offers the way back to the list when the entity is not found", async () => {
    const history = createMemoryHistory({ initialEntries: ["/agents/99"] });
    render(
      <Router history={history}>
        <EntityDetailUnavailable {...props} isNotFound />
      </Router>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Agent not found" })
    ).toBeInTheDocument();
    expect(screen.getByText(props.notFoundBody)).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Back to agents" }));
    expect(history.location.pathname).toBe("/agents");
  });

  it("reports an API failure as an error, not as not found", () => {
    render(
      <Router history={createMemoryHistory()}>
        <EntityDetailUnavailable {...props} isNotFound={false} />
      </Router>
    );
    // The trail stays, with the noun leaf, above the shared error state.
    expect(screen.getByRole("link", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Agent")).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("heading", { name: "message.unableToConnect" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Agent not found")).not.toBeInTheDocument();
    // No retry and no way back (parity with the other error states).
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
