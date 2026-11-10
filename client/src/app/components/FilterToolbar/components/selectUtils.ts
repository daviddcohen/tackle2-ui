import { FilterSelectOptionProps } from "../FilterToolbar";

const NO_RESULTS = "no-results";

export const getDisplayValue = (
  value: string,
  options: FilterSelectOptionProps[]
) => {
  const option = options.find((option) => option.value === value);
  return toDisplayValue(option);
};

export const toDisplayValue = (option?: FilterSelectOptionProps) => {
  return option?.label ?? option?.value ?? "";
};

export const toChipDisplayValue = (option?: FilterSelectOptionProps) => {
  return option?.chipLabel ?? toDisplayValue(option);
};

export const getDisplayValueForChip = (
  value: string,
  options: FilterSelectOptionProps[]
) => {
  const option = options.find((option) => option.value === value);
  return toChipDisplayValue(option);
};

export const noResultsId = (idPrefix: string) => `${idPrefix}-${NO_RESULTS}`;

export const getStableIndex = (
  value: unknown,
  options: FilterSelectOptionProps[]
) => {
  return options.findIndex((option) => option.value === value);
};

/**
 * Claims an Escape key press for a select whose menu is open.
 *
 * A PatternFly Modal closes on any Escape that bubbles to `document.body`,
 * and it registers that listener before React's own listener there, while
 * PatternFly's Select only closes its menu from a `window` listener, which
 * runs last. Without this, Escape inside an open select closes the whole
 * modal and discards the form. Call it from the toggle's and the menu's
 * `onKeyDownCapture` (the capture phase runs before the Modal's bubble
 * listener); when it returns `true` the event is stopped and the caller
 * closes the menu.
 */
export const claimEscapeForOpenMenu = (
  event: React.KeyboardEvent<HTMLElement>,
  isOpen: boolean
) => {
  if (event.key !== "Escape" || !isOpen) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
};
