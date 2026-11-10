import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, ModalBody } from "@patternfly/react-core";

import { MultiSelect } from "../MultiSelect";
import SimpleSelect from "../SimpleSelect";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

const InModal = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => (
  <Modal isOpen onClose={onClose} aria-label="test modal" variant="small">
    <ModalBody>{children}</ModalBody>
  </Modal>
);

const ControlledMultiSelect = () => {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiSelect
      toggleId="multi"
      options={options}
      values={values}
      hasCheckbox
      onSelect={(value) =>
        value != null &&
        setValues((current) =>
          current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value]
        )
      }
      onClear={() => setValues([])}
    />
  );
};

describe("selects inside a Modal", () => {
  it("MultiSelect: Escape with focus on an option closes only the menu", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <InModal onClose={onClose}>
        <ControlledMultiSelect />
      </InModal>
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Alpha"));
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();

    // with the menu closed, Escape is the Modal's again
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("SimpleSelect: Escape on the open toggle or an option closes only the menu", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <InModal onClose={onClose}>
        <SimpleSelect
          toggleId="simple"
          toggleAriaLabel="simple select"
          options={options}
          onSelect={jest.fn()}
        />
      </InModal>
    );

    const toggle = screen.getByRole("button", { name: "simple select" });
    await user.click(toggle);
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();

    await user.click(toggle);
    (await screen.findByRole("option", { name: "Beta" })).focus();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(toggle).toHaveFocus();
  });
});
