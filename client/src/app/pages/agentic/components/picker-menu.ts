import { PopperOptions } from "@patternfly/react-core";

/**
 * The skill, skill collection and agent pickers' menu: as wide as the field,
 * bounded in height, and opening upward when there is no room below.
 */
export const PICKER_MENU_HEIGHT = "16rem";
export const PICKER_MENU_POPPER: PopperOptions = {
  width: "trigger",
  enableFlip: true,
};
