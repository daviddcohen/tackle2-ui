import * as React from "react";
import { render, screen } from "@testing-library/react";

import { useBodyHeight } from "./use-body-height";

/** A view with 100 px of chrome around a body of the height it is given. */
const View: React.FC<{ total?: number; hasBody?: boolean }> = ({
  total,
  hasBody = true,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const body = useBodyHeight(total, ref, "body");
  return (
    <div ref={ref} data-testid="container" data-body={body ?? 0}>
      {hasBody && <div className="body" data-height={body ?? 0} />}
      <span data-testid="body">{body ?? "auto"}</span>
    </div>
  );
};

describe("useBodyHeight", () => {
  let rectSpy: jest.SpyInstance;

  beforeEach(() => {
    // The container is its chrome plus its body; the body has 8 px of
    // padding on each side around the height it was given.
    rectSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const container = this.closest("[data-testid=container]");
        const given = Number(container?.getAttribute("data-body") ?? 0);
        if (this.classList.contains("body")) {
          return { height: given + 16 } as DOMRect;
        }
        return { height: 100 + given + 16 } as DOMRect;
      });
    jest.spyOn(window, "getComputedStyle").mockImplementation(
      (element: Element) =>
        ({
          paddingTop: element.classList.contains("body") ? "8px" : "0px",
          paddingBottom: element.classList.contains("body") ? "8px" : "0px",
          borderTopWidth: "0px",
          borderBottomWidth: "0px",
        }) as CSSStyleDeclaration
    );
  });

  afterEach(() => {
    rectSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("gives the body the total less the chrome around it", () => {
    render(<View total={600} />);
    // 100 px of chrome and the body's 16 px of padding.
    expect(screen.getByTestId("body")).toHaveTextContent("484");
  });

  it("is undefined without a total, so the view sizes itself", () => {
    render(<View />);
    expect(screen.getByTestId("body")).toHaveTextContent("auto");
  });

  it("gives the whole total until the body exists", () => {
    render(<View total={600} hasBody={false} />);
    expect(screen.getByTestId("body")).toHaveTextContent("600");
  });

  it("renders once more after the body height changes", () => {
    const renders: (number | undefined)[] = [];
    const Counting: React.FC<{ total: number }> = ({ total }) => {
      const ref = React.useRef<HTMLDivElement>(null);
      const body = useBodyHeight(total, ref, "body");
      renders.push(body);
      return <div ref={ref} />;
    };
    const { rerender } = render(<Counting total={600} />);
    renders.length = 0;
    rerender(<Counting total={700} />);
    // The render with the new height, then one more that sees it in the DOM.
    expect(renders.length).toBeGreaterThanOrEqual(2);
    expect(new Set(renders)).toEqual(new Set([700]));
  });
});
