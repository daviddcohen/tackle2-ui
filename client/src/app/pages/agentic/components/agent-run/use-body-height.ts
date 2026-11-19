import * as React from "react";

const px = (value: string) => parseFloat(value) || 0;

/** The height of an element's content box: what a `height` prop sets. */
const contentHeight = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return (
    element.getBoundingClientRect().height -
    px(style.borderTopWidth) -
    px(style.borderBottomWidth) -
    px(style.paddingTop) -
    px(style.paddingBottom)
  );
};

/**
 * How tall the body of a view (the log viewer's list, the code editor) can
 * be for the whole view to be `total` pixels tall: `total` less what the
 * view puts around its body (toolbar, status sentence, alert, editor
 * header). The components take the body height as a prop (`LogViewer
 * height`, `CodeEditor height`), so the view needs no inline style.
 *
 * The space around the body is measured from the DOM: the container's
 * height less the body's content height, found by `bodyClassName` inside
 * `containerRef`. It does not depend on the body height, so the measurement
 * settles after one pass. It is measured again when the container changes
 * size (an alert or a longer status line).
 *
 * Returns undefined when `total` is undefined (the view sizes itself).
 */
export const useBodyHeight = (
  total: number | undefined,
  containerRef: React.RefObject<HTMLElement>,
  bodyClassName: string
): number | undefined => {
  const [around, setAround] = React.useState(0);
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (total == null || container == null) return;
    const measure = () => {
      const body = container.querySelector(`.${bodyClassName}`);
      if (!(body instanceof HTMLElement)) return;
      const next = Math.max(
        0,
        Math.round(
          container.getBoundingClientRect().height - contentHeight(body)
        )
      );
      setAround((previous) => (previous === next ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [total, containerRef, bodyClassName]);
  const body = total == null ? undefined : Math.max(0, total - around);
  // `LogViewer` reads its body's height from the DOM while it renders, so
  // the render that sets a new height still sees the old one: render once
  // more after each change, so it sizes its list to the new height.
  const [, setPass] = React.useState(0);
  React.useLayoutEffect(() => {
    setPass((pass) => pass + 1);
  }, [body]);
  return body;
};
