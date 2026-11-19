import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Table, Tbody, Td, Tr } from "@patternfly/react-table";

import { render, screen } from "@app/test-config/test-utils";

import { useLocalTableControls } from "../useLocalTableControls";

interface Row {
  id: number;
  name: string;
}

const rows: Row[] = [{ id: 1, name: "First" }];

interface TestTableProps {
  onRowClick: () => void;
  onButtonClick: () => void;
  onLinkClick: () => void;
}

const TestTable = ({
  onRowClick,
  onButtonClick,
  onLinkClick,
}: TestTableProps) => {
  const tableControls = useLocalTableControls({
    tableName: "keyboard-test",
    idProperty: "id",
    items: rows,
    columnNames: { name: "Name", actions: "Actions" },
    isActiveItemEnabled: true,
  });
  const {
    currentPageItems,
    propHelpers: { tableProps, getTrProps, getTdProps },
  } = tableControls;
  return (
    <Table {...tableProps} aria-label="Keyboard test">
      <Tbody>
        {currentPageItems.map((item) => (
          <Tr key={item.id} {...getTrProps({ item, onRowClick })}>
            <Td {...getTdProps({ columnKey: "name" })}>
              <a
                href="#details"
                onClick={(event) => {
                  event.preventDefault();
                  onLinkClick();
                }}
              >
                {item.name}
              </a>
            </Td>
            <Td {...getTdProps({ columnKey: "actions" })}>
              <button type="button" onClick={onButtonClick}>
                Row actions
              </button>
              <span role="button" tabIndex={0}>
                Custom control
              </span>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

const setup = () => {
  const handlers = {
    onRowClick: jest.fn(),
    onButtonClick: jest.fn(),
    onLinkClick: jest.fn(),
  };
  render(
    <MemoryRouter>
      <TestTable {...handlers} />
    </MemoryRouter>
  );
  return { user: userEvent.setup(), ...handlers };
};

describe("table rows with clickable content, from the keyboard", () => {
  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])(
    "%s on a button inside a row activates the button, not the row",
    async (_name, key) => {
      const { user, onRowClick, onButtonClick } = setup();
      screen.getByRole("button", { name: "Row actions" }).focus();
      await user.keyboard(key);
      expect(onButtonClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])(
    "%s on a non-native control inside a row leaves the row alone",
    async (_name, key) => {
      const { user, onRowClick } = setup();
      screen.getByRole("button", { name: "Custom control" }).focus();
      await user.keyboard(key);
      expect(onRowClick).not.toHaveBeenCalled();
    }
  );

  it("Enter on a link inside a row follows the link, not the row", async () => {
    const { user, onRowClick, onLinkClick } = setup();
    screen.getByRole("link", { name: "First" }).focus();
    await user.keyboard("{Enter}");
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])("%s on the focused row itself triggers the row", async (_name, key) => {
    const { user, onRowClick, onButtonClick } = setup();
    const row = screen.getByRole("row");
    row.focus();
    expect(row).toHaveFocus();
    await user.keyboard(key);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onButtonClick).not.toHaveBeenCalled();
  });

  it("other keys on the row do nothing", async () => {
    const { user, onRowClick } = setup();
    screen.getByRole("row").focus();
    await user.keyboard("a");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
