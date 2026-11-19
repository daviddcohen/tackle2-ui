import userEvent from "@testing-library/user-event";
import { ActionsColumn, Table, Tbody, Td, Tr } from "@patternfly/react-table";

import { render, screen, waitFor } from "@app/test-config/test-utils";

import { deleteActionProps, disabledActionProps } from "./agentic";

const renderRowMenu = (onDelete = jest.fn()) =>
  render(
    <Table aria-label="Rows">
      <Tbody>
        <Tr>
          <Td>Row</Td>
          <Td isActionCell>
            <ActionsColumn
              items={[
                { title: "Edit", onClick: jest.fn() },
                {
                  title: "Delete",
                  onClick: onDelete,
                  ...deleteActionProps(
                    "Used by 2 agents.",
                    "rows-table-row-1-delete"
                  ),
                },
              ]}
            />
          </Td>
        </Tr>
      </Tbody>
    </Table>
  );

describe("disabled row actions in an ActionsColumn", () => {
  it("keeps the plain tooltip props without a trigger id", () => {
    expect(disabledActionProps("In use", "left")).toEqual({
      isAriaDisabled: true,
      tooltipProps: { content: "In use", position: "left" },
    });
    expect(disabledActionProps(undefined, "left", "x")).toEqual({});
  });

  it("renders its own button for an item with a trigger id", () => {
    const props = deleteActionProps("In use", "models-table-row-1-delete");
    expect(props).toMatchObject({
      id: "models-table-row-1-delete",
      isAriaDisabled: true,
      isDanger: false,
    });
    expect(props.tooltipProps).toBeUndefined();
    // The same component across renders, so an open menu keeps its items.
    expect(
      deleteActionProps("In use", "models-table-row-1-delete").component
    ).toBe(props.component);
  });

  it("describes the focused item with its reason and shows it in a tooltip", async () => {
    const user = userEvent.setup();
    renderRowMenu();
    await user.click(screen.getByRole("button", { name: "Kebab toggle" }));
    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteItem).toHaveAttribute("id", "rows-table-row-1-delete");
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem).toHaveAccessibleDescription("Used by 2 agents.");
    deleteItem.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Used by 2 agents."
    );
    deleteItem.blur();
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("shows the reason on hover and does nothing on click", async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    renderRowMenu(onDelete);
    await user.click(screen.getByRole("button", { name: "Kebab toggle" }));
    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    await user.hover(deleteItem);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Used by 2 agents."
    );
    await user.click(deleteItem);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps each row's description and tooltip apart when rows share a reason", async () => {
    const user = userEvent.setup();
    const rows = ["1", "2"];
    render(
      <Table aria-label="Rows">
        <Tbody>
          {rows.map((id) => (
            <Tr key={id}>
              <Td>Row {id}</Td>
              <Td isActionCell>
                <ActionsColumn
                  items={[
                    { title: "Edit", onClick: jest.fn() },
                    {
                      title: "Delete",
                      onClick: jest.fn(),
                      ...deleteActionProps(
                        "Used by 2 agents.",
                        `rows-table-row-${id}-delete`
                      ),
                    },
                  ]}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    );
    const [first, second] = screen.getAllByRole("button", {
      name: "Kebab toggle",
    });
    await user.click(first);
    const firstDelete = screen.getByRole("menuitem", { name: "Delete" });
    expect(firstDelete).toHaveAttribute(
      "aria-describedby",
      "rows-table-row-1-delete-reason"
    );
    await user.click(first);
    await user.click(second);
    const secondDelete = screen.getByRole("menuitem", { name: "Delete" });
    expect(secondDelete).toHaveAttribute(
      "aria-describedby",
      "rows-table-row-2-delete-reason"
    );
    expect(secondDelete).toHaveAccessibleDescription("Used by 2 agents.");
    secondDelete.focus();
    expect(await screen.findAllByRole("tooltip")).toHaveLength(1);
  });
});
