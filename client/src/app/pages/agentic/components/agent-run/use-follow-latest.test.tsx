import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useFollowLatest } from "./use-follow-latest";

/** A box with `count` lines of 20 px, 200 px tall. */
const Box: React.FC<{ count: number; isFollowing: boolean }> = ({
  count,
  isFollowing,
}) => {
  const { ref, resumeFollowing } = useFollowLatest(isFollowing);
  return (
    <>
      <div ref={ref} data-testid="box" tabIndex={0}>
        <pre data-testid="output" tabIndex={0}>
          <code>output</code>
        </pre>
        {Array.from({ length: count }, (_, i) => (
          <p key={i}>line {i}</p>
        ))}
      </div>
      <button onClick={resumeFollowing}>Back to latest</button>
    </>
  );
};

/** jsdom has no layout: the box's height follows its line count. */
const layOut = (box: HTMLElement) => {
  Object.defineProperty(box, "clientHeight", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(box, "scrollHeight", {
    configurable: true,
    get: () => box.querySelectorAll("p").length * 20,
  });
};

const scrollTo = (box: HTMLElement, top: number) => {
  box.scrollTop = top;
  box.dispatchEvent(new Event("scroll"));
};

const setUp = (isFollowing: boolean) => {
  const view = render(<Box count={20} isFollowing={false} />);
  const box = screen.getByTestId("box");
  layOut(box);
  view.rerender(<Box count={20} isFollowing={isFollowing} />);
  return { ...view, box };
};

/** Lets the mutation observer see the new lines. */
const grow = async (
  rerender: ReturnType<typeof render>["rerender"],
  count: number
) => {
  await act(async () => {
    rerender(<Box count={count} isFollowing />);
  });
};

describe("useFollowLatest", () => {
  it("opens at the latest entry and follows new ones", async () => {
    const { box, rerender } = setUp(true);
    expect(box.scrollTop).toBe(400);
    await grow(rerender, 30);
    expect(box.scrollTop).toBe(600);
  });

  it("lets go when the reader scrolls up, and follows again at the bottom", async () => {
    const { box, rerender } = setUp(true);
    scrollTo(box, 100);
    await grow(rerender, 30);
    expect(box.scrollTop).toBe(100);

    // Back at the bottom by any means: following again.
    scrollTo(box, 400);
    await grow(rerender, 40);
    expect(box.scrollTop).toBe(800);
  });

  // The intent comes before the scroll it causes: an entry arriving in
  // between must not pull the reader back.
  const intents: [string, (box: HTMLElement) => void][] = [
    [
      "a wheel move up",
      (box) => {
        fireEvent.wheel(box, { deltaY: -100 });
      },
    ],
    [
      "a touch move up",
      (box) => {
        fireEvent.touchMove(box, { touches: [{ clientY: 100 }] });
        fireEvent.touchMove(box, { touches: [{ clientY: 160 }] });
      },
    ],
    ...["ArrowUp", "PageUp", "Home"].map(
      (key): [string, (box: HTMLElement) => void] => [
        key,
        (box) => {
          fireEvent.keyDown(box, { key });
        },
      ]
    ),
  ];
  it.each(intents)(
    "lets go on %s, before the box scrolls",
    async (_name, intent) => {
      const { box, rerender } = setUp(true);
      intent(box);
      await grow(rerender, 30);
      expect(box.scrollTop).toBe(400);
    }
  );

  it("keeps following on an up key in an output block, which scrolls that block", async () => {
    const { box, rerender } = setUp(true);
    fireEvent.keyDown(screen.getByText("output"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByTestId("output"), { key: "Home" });
    await grow(rerender, 30);
    expect(box.scrollTop).toBe(600);
  });

  it("keeps following on a wheel move down, a touch move down or ArrowDown", async () => {
    const { box, rerender } = setUp(true);
    fireEvent.wheel(box, { deltaY: 100 });
    fireEvent.touchMove(box, { touches: [{ clientY: 160 }] });
    fireEvent.touchMove(box, { touches: [{ clientY: 100 }] });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await grow(rerender, 30);
    expect(box.scrollTop).toBe(600);
  });

  it("follows again from the jump button, on the way down to the latest entry", async () => {
    const { box, rerender } = setUp(true);
    scrollTo(box, 0);
    screen.getByRole("button", { name: "Back to latest" }).click();
    // The jump button scrolls smoothly: it passes positions above the
    // bottom, moving down, and following holds.
    scrollTo(box, 100);
    await grow(rerender, 30);
    expect(box.scrollTop).toBe(600);
  });

  it("does nothing while not following", async () => {
    const { box, rerender } = setUp(false);
    expect(box.scrollTop).toBe(0);
    await act(async () => {
      rerender(<Box count={30} isFollowing={false} />);
    });
    expect(box.scrollTop).toBe(0);
  });
});
