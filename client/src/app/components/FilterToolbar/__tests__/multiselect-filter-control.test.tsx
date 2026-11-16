import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FilterType, IMultiselectFilterCategory } from "../FilterToolbar";
import { MultiselectFilterControl } from "../MultiselectFilterControl";

const category = (
  overrides: Partial<IMultiselectFilterCategory<unknown, string>> = {}
): IMultiselectFilterCategory<unknown, string> => ({
  categoryKey: "status",
  title: "Status",
  type: FilterType.multiselect,
  selectOptions: [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ],
  ...overrides,
});

const openMenu = async (
  overrides: Partial<IMultiselectFilterCategory<unknown, string>>
) => {
  render(
    <MultiselectFilterControl
      category={category(overrides)}
      filterValue={undefined}
      setFilterValue={jest.fn()}
      showToolbarItem
    />
  );
  await userEvent.setup().click(screen.getByRole("combobox"));
  // PF renders the height on the menu content around the option list.
  return (await screen.findByRole("listbox")).closest(
    ".pf-v6-c-menu__content"
  ) as HTMLElement;
};

describe("MultiselectFilterControl", () => {
  it("passes the category's maximum menu height to the menu", async () => {
    const content = await openMenu({ maxMenuHeight: "24rem" });
    expect(
      content.style.getPropertyValue("--pf-v6-c-menu__content--MaxHeight")
    ).toBe("24rem");
  });

  it("leaves the menu height to PF without one", async () => {
    const content = await openMenu({});
    expect(
      content.style.getPropertyValue("--pf-v6-c-menu__content--MaxHeight")
    ).toBe("");
  });
});
