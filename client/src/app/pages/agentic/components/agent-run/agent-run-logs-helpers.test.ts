import {
  ALL_CONTAINERS,
  FOLLOW_SLACK_PX,
  defaultLogContainer,
  displayLogLine,
  expandTabs,
  firstVisibleRow,
  followActionOnScroll,
  followScrollRow,
  keepSpaces,
  logFileName,
  logFileText,
  mainContainer,
  mapAppended,
  prefixLine,
  readerAnchor,
  secondsSince,
} from "./agent-run-logs-helpers";
import { stripAnsi } from "./strip-ansi";

const agentLog = (lines: string[], complete: boolean, extra = {}) => ({
  lines,
  complete,
  isLoading: false,
  error: null,
  ...extra,
});

const POD = ["skill-loader", "agent"];

describe("mainContainer and defaultLogContainer", () => {
  it("opens on the agent, else on the last container started", () => {
    expect(mainContainer(POD)).toBe("agent");
    expect(mainContainer(["init", "worker"])).toBe("worker");
    expect(mainContainer([])).toBe("agent");
  });

  it("shows the main container unless its log is finished and empty", () => {
    expect(defaultLogContainer(agentLog(["x"], true), POD)).toBe("agent");
    expect(defaultLogContainer(agentLog([], false), POD)).toBe("agent");
    expect(defaultLogContainer(agentLog([], true), POD)).toBe("skill-loader");
    expect(
      defaultLogContainer(agentLog([], true, { isLoading: true }), POD)
    ).toBe("agent");
    expect(
      defaultLogContainer(agentLog([], true, { error: new Error("x") }), POD)
    ).toBe("agent");
    expect(defaultLogContainer(undefined, POD)).toBe("agent");
    // No other container to fall back on.
    expect(defaultLogContainer(agentLog([], true), ["agent"])).toBe("agent");
  });
});

describe("mapAppended", () => {
  const upper = jest.fn((line: string) => line.toUpperCase());
  beforeEach(() => upper.mockClear());

  it("maps only the lines after what the previous version shared", () => {
    const first = ["a", "b", "partial"];
    const mapped = mapAppended(undefined, first, upper);
    expect(mapped).toEqual(["A", "B", "PARTIAL"]);
    upper.mockClear();

    const next = [first[0], first[1], "partial done", "c"];
    expect(mapAppended({ input: first, output: mapped }, next, upper)).toEqual([
      "A",
      "B",
      "PARTIAL DONE",
      "C",
    ]);
    expect(upper.mock.calls.map(([line]) => line)).toEqual([
      "partial done",
      "c",
    ]);
  });

  it("returns the previous output when nothing changed", () => {
    const lines = ["a", "b"];
    const output = mapAppended(undefined, lines, upper);
    expect(mapAppended({ input: lines, output }, lines, upper)).toBe(output);
    expect(mapAppended({ input: lines, output }, ["a", "b"], upper)).toBe(
      output
    );
  });

  it("maps again from the first difference, and handles a shorter list", () => {
    const lines = ["a", "b", "c"];
    const output = mapAppended(undefined, lines, upper);
    expect(mapAppended({ input: lines, output }, ["a", "x"], upper)).toEqual([
      "A",
      "X",
    ]);
    expect(mapAppended({ input: lines, output }, [], upper)).toEqual([]);
  });
});

describe("merged log and download", () => {
  it("prefixes a line with its container", () => {
    expect(prefixLine("skill-loader", "a")).toBe("[skill-loader] a");
  });

  it("names and fills the download file", () => {
    expect(logFileName("run-1-migrate", "agent")).toBe(
      "run-1-migrate-agent.log"
    );
    expect(logFileName("run-1-migrate", "skill-loader")).toBe(
      "run-1-migrate-skill-loader.log"
    );
    expect(logFileName("run-1-migrate", ALL_CONTAINERS)).toBe(
      "run-1-migrate-all-containers.log"
    );
    expect(logFileText(["a", "b"])).toBe("a\nb\n");
    expect(logFileText([])).toBe("");
  });
});

describe("following", () => {
  const event = (
    scrollDirection: "forward" | "backward",
    scrollOffsetToBottom: number,
    scrollUpdateWasRequested = false
  ) => ({
    scrollDirection,
    scrollOffset: 100,
    scrollOffsetToBottom,
    scrollUpdateWasRequested,
  });

  it("pauses only when the user scrolls up away from the end", () => {
    const far = FOLLOW_SLACK_PX + 1;
    expect(followActionOnScroll(event("backward", far), true)).toBe("pause");
    expect(followActionOnScroll(event("backward", FOLLOW_SLACK_PX), true)).toBe(
      "none"
    );
    expect(followActionOnScroll(event("backward", far, true), true)).toBe(
      "none"
    );
    expect(followActionOnScroll(event("forward", far), true)).toBe("none");
    expect(followActionOnScroll(event("backward", far), false)).toBe("none");
  });

  it("goes back to the end when a new list is created while following", () => {
    expect(followActionOnScroll(event("forward", -1), true)).toBe(
      "scrollToEnd"
    );
    expect(followActionOnScroll(event("forward", -1), false)).toBe("none");
  });

  it("targets the last line only while following", () => {
    expect(followScrollRow(true, 10)).toBe(9);
    expect(followScrollRow(false, 10)).toBeUndefined();
    expect(followScrollRow(true, 0)).toBeUndefined();
  });

  it("counts whole seconds since an update", () => {
    expect(secondsSince(1_000, 6_999)).toBe(5);
    expect(secondsSince(5_000, 1_000)).toBe(0);
  });
});

describe("firstVisibleRow", () => {
  it("is the lowest line whose bottom is below the view's top, 0-based", () => {
    const rows = [
      { lineNumber: 41, bottom: 95 },
      { lineNumber: 42, bottom: 113 },
      { lineNumber: 43, bottom: 131 },
    ];
    expect(firstVisibleRow(rows, 100)).toBe(41);
    expect(firstVisibleRow(rows, 0)).toBe(40);
  });

  it("is undefined without rendered rows", () => {
    expect(firstVisibleRow([], 0)).toBeUndefined();
    expect(
      firstVisibleRow([{ lineNumber: NaN, bottom: 10 }], 0)
    ).toBeUndefined();
  });
});

describe("readerAnchor", () => {
  it("prefers the current search match, centered as search shows it", () => {
    expect(
      readerAnchor({ isFollowing: false, matchRow: 24019, topRow: 3 })
    ).toEqual({ row: 24019, align: "center" });
  });

  it("falls back to the first row in view", () => {
    expect(readerAnchor({ isFollowing: false, topRow: 3 })).toEqual({
      row: 3,
      align: "start",
    });
  });

  it("keeps nothing while following: the end is the place", () => {
    expect(
      readerAnchor({ isFollowing: true, matchRow: 5, topRow: 3 })
    ).toBeUndefined();
    expect(readerAnchor({ isFollowing: false })).toBeUndefined();
  });
});

describe("expandTabs", () => {
  it.each([
    ["no tabs", "no tabs"],
    ["\tINFO", "        INFO"],
    ["ab\tINFO", "ab      INFO"],
    ["12345678\tx", "12345678        x"],
    ["a\tb\tc", "a       b       c"],
  ])("%j -> %j", (line, expected) => {
    expect(expandTabs(line)).toBe(expected);
  });

  it("gives ANSI colors no width, so colored and plain lines line up", () => {
    const colored = "12:00:00Z\t\u001b[36mINFO\u001b[0m\tgoose: done";
    const plain = "12:00:00Z\tINFO\tgoose: done";
    expect(expandTabs(colored)).toBe(
      "12:00:00Z       \u001b[36mINFO\u001b[0m    goose: done"
    );
    expect(stripAnsi(expandTabs(colored))).toBe(expandTabs(plain));
  });
});

describe("keepSpaces", () => {
  const nb = "\u00a0";
  it.each([
    ["no runs", "no runs"],
    ["    at Foo.bar(Foo.java:12)", `${nb.repeat(4)}at Foo.bar(Foo.java:12)`],
    ["a  b", `a ${nb}b`],
    ["a     b c", `a ${nb.repeat(4)}b c`],
    [" x", `${nb}x`],
  ])("%j", (line, expected) => {
    expect(keepSpaces(line)).toBe(expected);
  });

  it("keeps single spaces, so a search for words still matches", () => {
    expect(keepSpaces("$ mvn -q -DskipTests package")).toBe(
      "$ mvn -q -DskipTests package"
    );
  });

  it("is what the view shows after the tabs are expanded", () => {
    expect(displayLogLine("Z\tINFO\ttool")).toBe(
      `Z ${nb.repeat(6)}INFO ${nb.repeat(3)}tool`
    );
  });
});
