import { PlanRun, StageMessage, StageRun } from "@app/agentic";

import {
  formatDuration,
  planRunDurationSeconds,
  stageRunDurationSeconds,
} from "./agentic";

const start = "2026-11-10T10:06:00Z";
const now = Date.parse("2026-11-10T10:15:30Z");
const messages: StageMessage[] = [
  "2026-11-10T10:07:00Z",
  "2026-11-10T10:15:00Z",
  "2026-11-10T10:10:00Z",
].map((timestamp) => ({ role: "agent", content: "", timestamp }));

describe("stageRunDurationSeconds", () => {
  it("measures a finished stage from start to completion", () => {
    const seconds = stageRunDurationSeconds(
      {
        status: "Succeeded",
        startedAt: start,
        completedAt: "2026-11-10T12:21:00Z",
      },
      now
    );
    expect(seconds).toBe(8100);
    expect(formatDuration(seconds)).toBe("2h 15m");
  });

  it("measures a running stage up to now, whatever its messages say", () => {
    expect(
      stageRunDurationSeconds({ status: "Running", startedAt: start }, now)
    ).toBe(570);
    expect(
      stageRunDurationSeconds(
        { status: "Running", startedAt: start, messages },
        now
      )
    ).toBe(570);
  });

  it("stops a stage awaiting approval at its agent's last message", () => {
    expect(
      stageRunDurationSeconds(
        { status: "AwaitingApproval", startedAt: start, messages },
        now
      )
    ).toBe(540);
    expect(
      stageRunDurationSeconds(
        { status: "AwaitingApproval", startedAt: start },
        now
      )
    ).toBeUndefined();
  });

  it("ignores what people wrote while the stage waits", () => {
    const reply: StageMessage = {
      role: "user",
      content: "",
      timestamp: "2026-11-10T10:15:20Z",
    };
    expect(
      stageRunDurationSeconds(
        {
          status: "AwaitingApproval",
          startedAt: start,
          messages: [...messages, reply],
        },
        now
      )
    ).toBe(540);
    expect(
      stageRunDurationSeconds(
        { status: "AwaitingApproval", startedAt: start, messages: [reply] },
        now
      )
    ).toBeUndefined();
  });

  it("has no duration before the start", () => {
    expect(stageRunDurationSeconds({ status: "Pending" }, now)).toBeUndefined();
    expect(stageRunDurationSeconds({ status: "Running" }, now)).toBeUndefined();
  });

  it("does not keep counting a finished stage without a completion time", () => {
    expect(
      stageRunDurationSeconds({ status: "Failed", startedAt: start }, now)
    ).toBeUndefined();
  });

  it("ignores a completion before the start", () => {
    expect(
      stageRunDurationSeconds(
        { status: "Succeeded", startedAt: start, completedAt: "2026-11-10" },
        now
      )
    ).toBeUndefined();
  });
});

describe("planRunDurationSeconds", () => {
  it("measures a finished run from start to completion", () => {
    expect(
      planRunDurationSeconds(
        {
          status: "Failed",
          startedAt: start,
          completedAt: "2026-11-10T10:25:00Z",
          stageRuns: [{ status: "Failed" }],
        },
        now
      )
    ).toBe(1140);
  });

  it("measures a running run up to now", () => {
    expect(
      planRunDurationSeconds(
        {
          status: "Running",
          startedAt: start,
          stageRuns: [{ status: "Succeeded", messages }, { status: "Running" }],
        },
        now
      )
    ).toBe(570);
  });

  it("stops a run awaiting approval where its awaiting stage stopped", () => {
    const run: Pick<PlanRun, "status" | "startedAt"> & {
      stageRuns: Pick<StageRun, "status" | "messages">[];
    } = {
      status: "AwaitingApproval",
      startedAt: start,
      stageRuns: [
        { status: "Succeeded", messages: [messages[0]] },
        { status: "AwaitingApproval", messages },
        { status: "Pending" },
      ],
    };
    expect(planRunDurationSeconds(run, now)).toBe(540);
    // The list's runs wait for weeks: the wait still does not count.
    const weeksLater = Date.parse("2026-12-01T09:00:00Z");
    expect(planRunDurationSeconds(run, weeksLater)).toBe(540);
    expect(formatDuration(planRunDurationSeconds(run, weeksLater))).toBe("9m");
    expect(
      planRunDurationSeconds(
        { ...run, stageRuns: [{ status: "AwaitingApproval" }] },
        now
      )
    ).toBeUndefined();
  });

  it("has no duration before the start", () => {
    // A pending run carries a start time that is not one.
    expect(
      planRunDurationSeconds(
        { status: "Pending", startedAt: start, stageRuns: [] },
        now
      )
    ).toBeUndefined();
  });

  it("does not keep counting a finished run without a completion time", () => {
    expect(
      planRunDurationSeconds(
        { status: "Succeeded", startedAt: start, stageRuns: [] },
        now
      )
    ).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("rolls minutes up into hours from one hour on", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(9 * 60)).toBe("9m");
    expect(formatDuration(9 * 60 + 5)).toBe("9m 5s");
    expect(formatDuration(59 * 60 + 59)).toBe("59m 59s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3600 + 59)).toBe("1h");
    expect(formatDuration(2 * 3600 + 15 * 60 + 30)).toBe("2h 15m");
    expect(formatDuration(26 * 3600)).toBe("26h");
  });
});
