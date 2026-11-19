import * as React from "react";

/**
 * The smallest height of a full height stage view (the log, the YAML): about
 * 24 log lines. Below it the page scrolls instead.
 */
export const MIN_FILL_HEIGHT_PX = 480;

/**
 * The height that fills the scroll area from `top` to its bottom, keeping
 * `bottomSpace` free (the section padding below the view), and never less
 * than `minHeight`.
 */
export const fillHeight = ({
  viewportHeight,
  top,
  bottomSpace,
  minHeight,
}: {
  viewportHeight: number;
  top: number;
  bottomSpace: number;
  minHeight: number;
}) => Math.max(minHeight, Math.floor(viewportHeight - top - bottomSpace));

const scrollParentOf = (element: HTMLElement): HTMLElement | null => {
  for (
    let parent = element.parentElement;
    parent != null;
    parent = parent.parentElement
  ) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
      return parent;
    }
  }
  return null;
};

/**
 * Measures how tall the element can be to reach the bottom of the page's
 * scroll area (the PF page main container, or the window), with a floor of
 * `minHeight`. It measures on mount, on every window resize (which is also
 * when `LogViewer` and the code editor lay themselves out again), and when
 * the content of the scroll area changes size: an alert or a helper line
 * that appears above the element moves it down, and the content grows by
 * as much.
 *
 * Returns the ref to put on the element and its height, undefined until the
 * first measurement (before the first paint).
 */
export const useFillHeight = <T extends HTMLElement>(
  minHeight = MIN_FILL_HEIGHT_PX
) => {
  const ref = React.useRef<T>(null);
  const [height, setHeight] = React.useState<number>();
  React.useLayoutEffect(() => {
    const measure = () => {
      const element = ref.current;
      if (element == null) return;
      const parent = scrollParentOf(element);
      const rect = element.getBoundingClientRect();
      // The position in the scrolled content, so a scrolled page measures
      // the same as one at its top.
      const top =
        parent != null
          ? rect.top - parent.getBoundingClientRect().top + parent.scrollTop
          : rect.top + window.scrollY;
      const viewportHeight =
        parent != null ? parent.clientHeight : window.innerHeight;
      const bottomSpace =
        element.parentElement != null
          ? parseFloat(getComputedStyle(element.parentElement).paddingBottom) ||
            0
          : 0;
      setHeight(fillHeight({ viewportHeight, top, bottomSpace, minHeight }));
    };
    measure();
    window.addEventListener("resize", measure);
    // The element's own height changes the content's too; measuring again
    // then gives the same height, so this settles at once.
    const element = ref.current;
    const scrollArea =
      element != null ? (scrollParentOf(element) ?? document.body) : null;
    const observer =
      typeof ResizeObserver !== "undefined" && scrollArea != null
        ? new ResizeObserver(() => measure())
        : undefined;
    if (scrollArea != null) {
      Array.from(scrollArea.children).forEach((child) =>
        observer?.observe(child)
      );
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [minHeight]);
  return [ref, height] as const;
};
