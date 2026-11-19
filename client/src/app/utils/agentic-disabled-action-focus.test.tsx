import userEvent from "@testing-library/user-event";
import { ActionsColumn, Table, Tbody, Td, Tr } from "@patternfly/react-table";

import { render, screen } from "@app/test-config/test-utils";

import { deleteActionProps, disabledActionProps } from "./agentic";

describe("disabled row actions in an ActionsColumn", () => {
  it("binds the reason tooltip to the item's button when given an id", () => {
    const props = disabledActionProps("In use", "left", "model-1-delete");
    expect(props).toMatchObject({
      id: "model-1-delete",
      isAriaDisabled: true,
      tooltipProps: { content: "In use", position: "left" },
    });
    expect(deleteActionProps("In use", "model-1-delete")).toMatchObject({
      id: "model-1-delete",
      isDanger: false,
    });
    expect(disabledActionProps(undefined, "left", "model-1-delete")).toEqual(
      {}
    );
  });

  it("shows the reason when the disabled item gets keyboard focus", async () => {
    const user = userEvent.setup();
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
                    onClick: jest.fn(),
                    ...deleteActionProps("Used by 2 agents.", "row-1-delete"),
                  },
                ]}
              />
            </Td>
          </Tr>
        </Tbody>
      </Table>
    );
    await user.click(screen.getByRole("button", { name: "Kebab toggle" }));
    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteItem).toHaveAttribute("id", "row-1-delete");
    deleteItem.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Used by 2 agents."
    );
  });
});
