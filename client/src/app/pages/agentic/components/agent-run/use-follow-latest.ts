import * as React from "react";

/**
 * Distance from the bottom (px) that still counts as reading the latest
 * entry: wide enough for sub-pixel rounding, narrow enough that a deliberate
 * scroll up lets go.
 */
const AT_LATEST_PX = 40;

const isAtLatest = (box: HTMLElement) =>
  box.scrollHeight - box.scrollTop - box.clientHeight <= AT_LATEST_PX;

/** Keys that scroll a focused box up. */
const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

/**
 * Keeps a scrolling transcript on its latest entry while it records, without
 * fighting the reader.
 *
 * While `isFollowing`, the view opens at the latest entry and stays there as
 * entries arrive, but only as long as the reader is there too. New content
 * is noticed from the DOM, not from renders, so Markdown that lays out a
 * moment after its entry arrives and a tool card that grows are followed
 * too.
 *
 * The reader's intent to read back lets go at once: a wheel or touch move
 * up, or ArrowUp, PageUp or Home on the box. That comes before the scroll it
 * causes, so an entry arriving in between cannot pull the reader back. A
 * scroll up by any other means (the scrollbar) lets go too. Only a move up
 * lets go: a smooth scroll down to the latest entry passes positions above
 * the bottom, and must not stop following on the way. Back at the bottom,
 * by any means, it follows again.
 *
 * MessageBox `enableSmartScroll` (Chatbot 6.9) is not enough here: it
 * notices growth only when the box itself resizes, so a fixed-height box
 * does not follow new entries, and a reader who scrolled up by keyboard or
 * scrollbar is pulled back by `scrollToBottom`.
 *
 * Returns the ref to put on the scrolling element (a callback, so a view
 * that mounts it later, when the first entry arrives, is followed too), and
 * `resumeFollowing`, for a control that scrolls to the latest entry itself
 * (the message box's jump button): following again from now on.
 */
export const useFollowLatest = (isFollowing: boolean) => {
  // The element, as state so the effect below runs again for a new one,
  // and as a ref for the code that scrolls it.
  const [box, setBox] = React.useState<HTMLElement | null>(null);
  const boxRef = React.useRef<HTMLElement | null>(null);
  const followingRef = React.useRef(true);

  React.useEffect(() => {
    const element = boxRef.current;
    if (element == null || !isFollowing) return;
    let lastTop = element.scrollTop;
    let lastTouchY: number | undefined;
    const letGo = () => {
      followingRef.current = false;
    };
    const toLatest = () => {
      if (!followingRef.current) return;
      element.scrollTop = element.scrollHeight;
      lastTop = element.scrollTop;
    };
    const onScroll = () => {
      if (isAtLatest(element)) followingRef.current = true;
      else if (element.scrollTop < lastTop) letGo();
      lastTop = element.scrollTop;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) letGo();
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      // A finger moving down the screen scrolls the content up.
      if (y != null && lastTouchY != null && y > lastTouchY) letGo();
      lastTouchY = y;
    };
    const onTouchEnd = () => {
      lastTouchY = undefined;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // In a focusable scroll area of its own (tool output), the key
      // scrolls that area, not the box.
      const target = event.target as Element | null;
      if (target?.closest('[tabindex="0"]') !== element) return;
      if (UP_KEYS.has(event.key)) letGo();
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("keydown", onKeyDown);
    const observer = new MutationObserver(toLatest);
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    toLatest();
    return () => {
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
    };
  }, [box, isFollowing]);

  // Stable: a handler kept from an earlier render (MessageBox keeps its
  // first scroll handler) still works.
  const resumeFollowing = React.useCallback(() => {
    followingRef.current = true;
  }, []);

  // Only a new element changes the state: a ref is also called with null
  // (and again with the same element) when a component re-attaches it.
  const ref = React.useCallback((element: HTMLElement | null) => {
    if (element == null) return;
    boxRef.current = element;
    setBox(element);
  }, []);

  return { ref, resumeFollowing };
};
