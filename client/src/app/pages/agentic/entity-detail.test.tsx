import userEvent from "@testing-library/user-event";

import { render, screen } from "@app/test-config/test-utils";

import { EntityDetailActions } from "./entity-detail";

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "agentic.applicationDetail.actions" })
  );
  return user;
};

describe("EntityDetailActions", () => {
  it("lists the items first, then Edit, a separator and Delete", async () => {
    const onTest = jest.fn();
    render(
      <EntityDetailActions
        items={[{ key: "test", label: "Test agent", onClick: onTest }]}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const user = await openMenu();

    const menu = screen.getByRole("menu");
    const entries = Array.from(menu.querySelectorAll(":scope > li")).map(
      (li) => (li.getAttribute("role") === "separator" ? "---" : li.textContent)
    );
    expect(entries).toEqual([
      "Test agent",
      "actions.edit",
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

    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await user.click(screen.getByRole("menuitem", { name: "actions.edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
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
});
