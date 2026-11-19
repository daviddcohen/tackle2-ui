import * as React from "react";

// This recursive parent check is necessary because the event target could be,
// for example, the SVG icon inside a button rather than the button itself.
const isClickableElementInTheWay = (element: Element): boolean => {
  if (["input", "button", "a"].includes(element.tagName.toLowerCase())) {
    return true;
  }
  if (
    !element.parentElement ||
    element.parentElement?.tagName.toLowerCase() === "tr"
  ) {
    return false;
  }
  return isClickableElementInTheWay(element.parentElement);
};

/**
 * Works around problems caused by event propagation when handling a clickable element that contains other clickable elements.
 * - Used internally by useTableControlProps for the active item feature, but is generic and could be used outside tables.
 * - When a click event happens within a row, checks if there is a clickable element in between the target node and the row element.
 *   (For example: checkboxes, buttons or links).
 * - Prevents triggering the row click behavior when inner clickable elements or their children are clicked.
 */
export const handlePropagatedRowClick = <
  E extends React.KeyboardEvent | React.MouseEvent,
>(
  event: E | undefined,
  onRowClick: (event: E) => void
) => {
  if (
    event?.target instanceof Element &&
    !isClickableElementInTheWay(event.target)
  ) {
    onRowClick(event);
  }
};

/** Anything inside a row that handles Enter or Space itself. */
const KEYBOARD_INTERACTIVE_SELECTOR = [
  "input",
  "button",
  "a",
  "textarea",
  "select",
  "summary",
  "[contenteditable]:not([contenteditable=false])",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=combobox]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=option]",
  "[role=tab]",
  "[role=treeitem]",
].join(",");

/**
 * Keyboard counterpart of `handlePropagatedRowClick`, passed to `Tr` as `onKeyDown`.
 * - PatternFly's `Tr` handles Enter and Space for any row with `onRowClick` and always calls `preventDefault()`,
 *   even when the key was pressed on a button, link or checkbox inside the row. That cancels the inner element's own
 *   activation, so row kebabs did not open and links did not follow with the keyboard.
 * - This handler replaces it: Enter and Space trigger the row click (and are prevented) only when the row itself has
 *   focus, or an element inside it that does not handle the keys itself. Keys from an interactive element inside the
 *   row, or from content rendered elsewhere through a portal (a menu, a modal), are left alone.
 */
export const handlePropagatedRowKeyDown = (
  event: React.KeyboardEvent,
  onRowClick: (event: React.KeyboardEvent) => void
) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) {
    return;
  }
  const interactive = target.closest(KEYBOARD_INTERACTIVE_SELECTOR);
  if (interactive != null && row.contains(interactive)) {
    return;
  }
  event.preventDefault();
  onRowClick(event);
};
