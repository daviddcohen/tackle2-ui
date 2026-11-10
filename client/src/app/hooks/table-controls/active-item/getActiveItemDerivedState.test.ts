import { getActiveItemDerivedState } from "./getActiveItemDerivedState";

describe("drawer selection across table view changes", () => {
  const selected = { id: 0, name: "Selected archetype" };
  const another = { id: 2, name: "Another archetype" };
  const activeItemState = {
    activeItemId: selected.id,
    setActiveItemId: jest.fn(),
  };

  it("keeps the selected entity when filtering or pagination removes its row", () => {
    const args = {
      idProperty: "id" as const,
      activeItemState,
      activeItemItems: [selected, another],
    };
    expect(
      getActiveItemDerivedState({ ...args, currentPageItems: [another] })
        .activeItem
    ).toEqual(selected);
    expect(
      getActiveItemDerivedState({ ...args, currentPageItems: [] }).activeItem
    ).toEqual(selected);
  });

  it("retains page-bound selection for tables that do not opt into a complete dataset", () => {
    expect(
      getActiveItemDerivedState({
        idProperty: "id",
        activeItemState,
        currentPageItems: [another],
      }).activeItem
    ).toBeNull();
  });

  it("does not show a deleted entity even when its ID remains in the URL", () => {
    expect(
      getActiveItemDerivedState({
        idProperty: "id",
        activeItemState,
        currentPageItems: [],
        activeItemItems: [another],
      }).activeItem
    ).toBeNull();
  });
});
