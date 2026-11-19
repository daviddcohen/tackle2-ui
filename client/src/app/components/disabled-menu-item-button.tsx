import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type FocusEvent,
  type MouseEvent,
  type Ref,
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { Tooltip, type TooltipProps } from "@patternfly/react-core";

export interface DisabledMenuItemButtonOptions {
  /** Why the item is disabled: its tooltip and its accessible description. */
  reason: string;
  position?: TooltipProps["position"];
}

type ButtonProps = ComponentPropsWithoutRef<"button">;

const setRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === "function") ref(value);
  else if (ref != null) (ref as { current: T | null }).current = value;
};

const createButton = ({ reason, position }: DisabledMenuItemButtonOptions) =>
  forwardRef<HTMLButtonElement, ButtonProps>(function DisabledMenuItemButton(
    { onFocus, onBlur, onMouseEnter, onMouseLeave, ...props },
    forwardedRef
  ) {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const fallbackId = useId();
    const reasonId = `${props.id ?? fallbackId}-reason`;
    const ref = useCallback(
      (node: HTMLButtonElement | null) => {
        buttonRef.current = node;
        setRef(forwardedRef, node);
      },
      [forwardedRef]
    );
    return (
      <>
        {/* The button stays the list item's first child: the menu's arrow
            keys focus that child. */}
        <button
          type="button"
          {...props}
          // PatternFly sets these only on its own "button" component; this
          // item is always disabled.
          aria-disabled
          ref={ref}
          aria-describedby={reasonId}
          onFocus={(event: FocusEvent<HTMLButtonElement>) => {
            onFocus?.(event);
            setIsFocused(true);
          }}
          onBlur={(event: FocusEvent<HTMLButtonElement>) => {
            onBlur?.(event);
            setIsFocused(false);
          }}
          onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
            onMouseEnter?.(event);
            setIsHovered(true);
          }}
          onMouseLeave={(event: MouseEvent<HTMLButtonElement>) => {
            onMouseLeave?.(event);
            setIsHovered(false);
          }}
        />
        <span id={reasonId} hidden>
          {reason}
        </span>
        {/* The description already gives the reason to screen readers: no
            live region, so it is not read twice. */}
        <Tooltip
          content={reason}
          position={position}
          triggerRef={buttonRef}
          trigger="manual"
          isVisible={isFocused || isHovered}
          aria="none"
          aria-live="off"
        />
      </>
    );
  });

const buttons = new Map<string, ElementType>();

/**
 * The button of a disabled item in a PatternFly table `ActionsColumn`, passed
 * through the item's `component` prop, that explains why the item is
 * disabled on hover and on keyboard focus.
 *
 * `ActionsColumn` wraps an item's `tooltipProps` tooltip around the whole list
 * item, which never takes focus: the reason showed on hover only and was never
 * read out. This button shows the same PatternFly `Tooltip`, driven by its own
 * focus and hover handlers (so it works from the first frame the menu is
 * open), and carries the reason as its accessible description. The item's
 * `id` (unique on the page, else a generated one) names the hidden
 * description element.
 *
 * One component per reason and position, kept across renders so an open menu
 * never remounts its items.
 */
export const disabledMenuItemButton = (
  options: DisabledMenuItemButtonOptions
): ElementType => {
  const key = JSON.stringify([options.reason, options.position ?? null]);
  const existing = buttons.get(key);
  if (existing != null) return existing;
  const button = createButton(options);
  buttons.set(key, button);
  return button;
};
