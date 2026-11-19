import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultiSelect } from "../MultiSelect";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

const ControlledMultiSelect = ({
  initialValues,
  lockedValues,
  onSelect = jest.fn(),
}: {
  initialValues: string[];
  lockedValues?: string[];
  onSelect?: (value?: string) => void;
}) => {
  const [values, setValues] = useState(initialValues);
  return (
    <MultiSelect
      toggleId="multi"
      options={options}
      values={values}
      lockedValues={lockedValues}
      hasCheckbox
      hasChips
      onSelect={(value) => {
        onSelect(value);
        if (value == null) return;
        setValues((current) =>
          current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value]
        );
      }}
      onClear={() =>
        setValues((current) => current.filter((v) => lockedValues?.includes(v)))
      }
    />
  );
};

const chips = () =>
  within(screen.getByRole("list", { name: "Current selections" }));

describe("MultiSelect lockedValues", () => {
  it("renders locked chips without a close button and keeps the others removable", async () => {
    const user = userEvent.setup();
    render(
      <ControlledMultiSelect initialValues={["a", "b"]} lockedValues={["a"]} />
    );

    // The mocked translation returns the key; one close button per removable chip.
    const closeButtons = chips().getAllByRole("button", {
      name: "terms.removeSelection",
    });
    expect(closeButtons).toHaveLength(1);

    await user.click(closeButtons[0]);
    expect(chips().getByLabelText("Alpha")).toBeInTheDocument();
    expect(chips().queryByLabelText("Beta")).not.toBeInTheDocument();
  });

  it("ignores selecting a locked value from the menu", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <ControlledMultiSelect
        initialValues={["a"]}
        lockedValues={["a"]}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("menuitem", { name: /Alpha/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(chips().getByLabelText("Alpha")).toBeInTheDocument();
  });

  it("offers the clear button only when something removable is selected", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ControlledMultiSelect initialValues={["a"]} lockedValues={["a"]} />
    );
    expect(
      screen.queryByRole("button", { name: "actions.clearInputValue" })
    ).not.toBeInTheDocument();
    unmount();

    render(
      <ControlledMultiSelect initialValues={["a", "c"]} lockedValues={["a"]} />
    );
    await user.click(
      screen.getByRole("button", { name: "actions.clearInputValue" })
    );
    expect(chips().getByLabelText("Alpha")).toBeInTheDocument();
    expect(chips().queryByLabelText("Gamma")).not.toBeInTheDocument();
  });

  it("behaves as before without lockedValues", async () => {
    const user = userEvent.setup();
    render(<ControlledMultiSelect initialValues={["a", "b"]} />);
    expect(
      chips().getAllByRole("button", { name: "terms.removeSelection" })
    ).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "actions.clearInputValue" })
    );
    expect(screen.queryByLabelText("Alpha")).not.toBeInTheDocument();
  });
});
