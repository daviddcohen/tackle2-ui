import * as React from "react";
import { act, render, screen } from "@testing-library/react";

import {
  MIN_FILL_HEIGHT_PX,
  fillHeight,
  useFillHeight,
} from "./use-fill-height";

describe("fillHeight", () => {
  it("reaches the bottom of the scroll area, less the space kept below", () => {
    expect(
      fillHeight({
        viewportHeight: 900,
        top: 200,
        bottomSpace: 24,
        minHeight: 480,
      })
    ).toBe(676);
  });

  it("never goes under the floor, so the page scrolls instead", () => {
    expect(
      fillHeight({
        viewportHeight: 666,
        top: 480,
        bottomSpace: 24,
        minHeight: 480,
      })
    ).toBe(480);
  });
});

const Probe: React.FC = () => {
  const [ref, height] = useFillHeight<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe">
      {height ?? "unmeasured"}
    </div>
  );
};

describe("useFillHeight", () => {
  const innerHeight = window.innerHeight;
  let top = 100;
  let rectSpy: jest.SpyInstance;

  beforeEach(() => {
    top = 100;
    rectSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ top }) as DOMRect);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: innerHeight,
    });
  });

  const setViewport = (height: number) =>
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    });

  it("measures before the first paint, from the element's top", () => {
    setViewport(1000);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("900");
  });

  it("measures again when the window is resized, with the floor", () => {
    setViewport(1000);
    render(<Probe />);
    setViewport(400);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByTestId("probe")).toHaveTextContent(
      String(MIN_FILL_HEIGHT_PX)
    );
  });

  it("measures again when the content above it changes size", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observed: Element[] = [];
    const disconnect = jest.fn();
    const original = window.ResizeObserver;
    window.ResizeObserver = jest.fn((callback: ResizeObserverCallback) => {
      callbacks.push(callback);
      return {
        observe: (target: Element) => observed.push(target),
        unobserve: jest.fn(),
        disconnect,
      };
    }) as unknown as typeof ResizeObserver;
    try {
      setViewport(1000);
      const { unmount } = render(<Probe />);
      expect(screen.getByTestId("probe")).toHaveTextContent("900");
      expect(observed.length).toBeGreaterThan(0);

      // An alert appeared above: the element moved down.
      top = 160;
      act(() => {
        callbacks.forEach((callback) => callback([], {} as ResizeObserver));
      });
      expect(screen.getByTestId("probe")).toHaveTextContent("840");
      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      window.ResizeObserver = original;
    }
  });
});
