import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TypeaheadSelect from "../TypeaheadSelect";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

const ControlledTypeahead = ({
  initialValue,
  selectOptions,
}: {
  initialValue?: string;
  selectOptions: typeof options;
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <TypeaheadSelect
      toggleId="typeahead"
      options={selectOptions}
      value={value}
      onSelect={setValue}
    />
  );
};

describe("TypeaheadSelect with options that load after the value", () => {
  it("shows the selected option once the options arrive", () => {
    const { rerender } = render(
      <ControlledTypeahead initialValue="b" selectOptions={[]} />
    );
    expect(screen.getByRole("combobox")).toHaveValue("");

    rerender(<ControlledTypeahead initialValue="b" selectOptions={options} />);
    expect(screen.getByRole("combobox")).toHaveValue("Beta");
  });

  it("keeps the typed text when the options change while editing", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ControlledTypeahead initialValue="b" selectOptions={options} />
    );
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Beta");

    await user.clear(input);
    await user.type(input, "Alp");
    rerender(
      <ControlledTypeahead
        initialValue="b"
        selectOptions={[...options, { value: "c", label: "Gamma" }]}
      />
    );
    expect(input).toHaveValue("Alp");

    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    expect(input).toHaveValue("Alpha");
  });
});
