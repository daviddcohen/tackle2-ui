import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultiSelect, MultiSelectProps } from "../MultiSelect";

const renderSelect = (props: Partial<MultiSelectProps> = {}) =>
  render(
    <>
      <MultiSelect
        toggleId="multi"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        values={[]}
        onSelect={jest.fn()}
        onClear={jest.fn()}
        {...props}
      />
      <div id="multi-helper">Pick one or more.</div>
    </>
  );

describe("MultiSelect input and popper props", () => {
  it("names the input by its field and links the helper text", () => {
    renderSelect({
      inputAriaLabel: "Skill collections",
      inputAriaDescribedBy: "multi-helper",
    });

    const input = screen.getByRole("combobox", { name: "Skill collections" });
    expect(input).toHaveAccessibleDescription("Pick one or more.");
  });

  it("keeps the PatternFly default name and no description without them", () => {
    renderSelect();

    const input = screen.getByRole("combobox", { name: "Type to filter" });
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("passes popper props to the menu", async () => {
    const user = userEvent.setup();
    renderSelect({ popperProps: { width: "trigger" } });

    await user.click(screen.getByRole("combobox"));
    await screen.findByText("Alpha");
    // PF sizes the menu to the toggle (0 px wide in jsdom) only with "trigger".
    expect(
      document.querySelector<HTMLElement>(".pf-v6-c-menu")!.style.width
    ).toBe("0px");
  });

  it("leaves the menu width alone without popper props", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    await screen.findByText("Alpha");
    expect(
      document.querySelector<HTMLElement>(".pf-v6-c-menu")!.style.width
    ).toBe("");
  });
});
