import userEvent from "@testing-library/user-event";

import { render, screen } from "@app/test-config/test-utils";

import {
  OverflowActionMenu,
  OverflowActionMenuItemProps,
} from "../overflow-action-menu";

const renderMenu = (items: OverflowActionMenuItemProps[]) =>
  render(
    <OverflowActionMenu
      toggleId="row-actions"
      toggleAriaLabel="Row actions"
      items={items}
    />
  );

describe("OverflowActionMenu", () => {
  it("renders no shared button group when no item is shared", async () => {
    const { container } = renderMenu([
      { itemKey: "view", title: "View" },
      { itemKey: "delete", title: "Delete" },
    ]);
    // An empty group used to push the kebab below the row text.
    expect(
      container.querySelector(".pf-v6-c-overflow-menu__content")
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.getByRole("menuitem", { name: "View" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  });

  it("renders shared items as buttons next to the kebab", () => {
    const onEdit = jest.fn();
    const { container } = renderMenu([
      { itemKey: "edit", title: "Edit", isShared: true, onClick: onEdit },
      { itemKey: "delete", title: "Delete" },
    ]);
    expect(
      container.querySelector(".pf-v6-c-overflow-menu__content")
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Row actions" })).toBeVisible();
  });
});
