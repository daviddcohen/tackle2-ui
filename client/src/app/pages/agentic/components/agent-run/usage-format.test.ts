import {
  contextPercent,
  formatCost,
  formatPercent,
  formatTokens,
  hasUsageReading,
  isContextNearlyFull,
} from "./usage-format";

describe("usage formatting", () => {
  it("writes token counts compactly with three significant digits", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(48_204)).toBe("48.2K");
    expect(formatTokens(121_400)).toBe("121K");
    expect(formatTokens(200_000)).toBe("200K");
    expect(formatTokens(1_290_311)).toBe("1.29M");
  });

  it("writes whole percentages", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(61)).toBe("61%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("writes a cost in its currency, or as a plain number", () => {
    expect(formatCost(3.42, "USD")).toBe("$3.42");
    expect(formatCost(3.4, "EUR")).toBe("€3.40");
    expect(formatCost(3.4)).toBe("3.40");
    expect(formatCost(3.4, "not-a-currency")).toBe("3.40");
  });
});

describe("contextPercent", () => {
  it("rounds down so the number and the thresholds agree", () => {
    expect(contextPercent({ contextUsed: 121_400, contextSize: 200_000 })).toBe(
      60
    );
    expect(contextPercent({ contextUsed: 159_999, contextSize: 200_000 })).toBe(
      79
    );
    expect(contextPercent({ contextUsed: 0, contextSize: 200_000 })).toBe(0);
  });

  it("stays between 0 and 100", () => {
    expect(contextPercent({ contextUsed: 250_000, contextSize: 200_000 })).toBe(
      100
    );
  });

  it("is not reported without the occupancy or a window", () => {
    expect(contextPercent(undefined)).toBeUndefined();
    expect(contextPercent({})).toBeUndefined();
    expect(contextPercent({ contextSize: 200_000 })).toBeUndefined();
    expect(contextPercent({ contextUsed: 10 })).toBeUndefined();
    expect(contextPercent({ contextUsed: 10, contextSize: 0 })).toBeUndefined();
  });
});

describe("isContextNearlyFull", () => {
  it("is true from 95 % while Running", () => {
    expect(isContextNearlyFull(80, "Running")).toBe(false);
    expect(isContextNearlyFull(94, "Running")).toBe(false);
    expect(isContextNearlyFull(95, "Running")).toBe(true);
    expect(isContextNearlyFull(100, "Running")).toBe(true);
  });

  it("is false once the stage is not running", () => {
    for (const phase of [
      "Succeeded",
      "Failed",
      "AwaitingApproval",
      "Pending",
    ] as const) {
      expect(isContextNearlyFull(97, phase)).toBe(false);
    }
  });
});

describe("hasUsageReading", () => {
  it.each([
    [undefined, false],
    [{}, false],
    // Known before the run starts: not a reading.
    [{ model: "m", maxTurns: 50, contextSize: 200_000 }, false],
    [{ contextUsed: 10 }, true],
    [{ inputTokens: 0 }, true],
    [{ turnsUsed: 1 }, true],
    [{ cost: 0.1 }, true],
    [{ compactions: 0 }, true],
  ])("%j: %s", (usage, expected) => {
    expect(hasUsageReading(usage)).toBe(expected);
  });
});
