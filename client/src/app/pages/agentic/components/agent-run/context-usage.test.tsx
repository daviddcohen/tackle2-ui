import { AgentRunUsage } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { ContextUsageCell, ContextUsageValue } from "./context-usage";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const usage = (contextUsed: number, extra: AgentRunUsage = {}) => ({
  contextUsed,
  contextSize: 200_000,
  ...extra,
});

const progressClass = (bar: HTMLElement) =>
  (bar.closest(".pf-v6-c-progress") as HTMLElement).className;

describe("ContextUsageValue", () => {
  it("shows the reading as text over a bar named by its term", () => {
    render(<ContextUsageValue phase="Running" usage={usage(121_400)} />);
    expect(screen.getByText("121K of 200K tokens (60%)")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(bar).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    expect(bar).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
    // Named like its term, with no visible title of its own.
    expect(
      bar
        .closest(".pf-v6-c-progress")
        ?.querySelector(".pf-v6-c-progress__title")
    ).toBeNull();
  });

  it("stays neutral at every level, with no status icon", () => {
    for (const used of [172_000, 194_000]) {
      const { unmount } = render(
        <ContextUsageValue phase="Running" usage={usage(used)} />
      );
      const bar = screen.getByRole("progressbar", { name: "Context window" });
      expect(progressClass(bar)).not.toMatch(/pf-m-(warning|danger)/);
      expect(
        bar
          .closest(".pf-v6-c-progress")
          ?.querySelector(".pf-v6-c-progress__status-icon")
      ).toBeNull();
      unmount();
    }
  });

  it("says nearly full from 95 % only while running", () => {
    const { rerender } = render(
      <ContextUsageValue phase="Running" usage={usage(194_000)} />
    );
    const helper = screen.getByText(
      "Context nearly full. The agent compacts its context automatically."
    );
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-describedby", helper.closest("[id]")?.id);

    // Below the threshold, and once the stage stopped, there is no helper.
    rerender(<ContextUsageValue phase="Running" usage={usage(186_000)} />);
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
    rerender(<ContextUsageValue phase="Succeeded" usage={usage(194_000)} />);
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).not.toHaveAttribute("aria-describedby");
  });

  it("adds the peak once the stage stopped", () => {
    render(
      <ContextUsageValue
        phase="Succeeded"
        usage={usage(194_000, { peakContextUsed: 196_500 })}
      />
    );
    const reading = "194K of 200K tokens (97%) · Peak 197K";
    expect(screen.getByText(reading)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", reading);
  });

  it("leaves out a peak equal to the last value", () => {
    render(
      <ContextUsageValue
        phase="Failed"
        usage={usage(123_000, { peakContextUsed: 123_400 })}
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", "123K of 200K tokens (61%)");
  });

  it("is a loading value while the runs load, with no bar", () => {
    render(<ContextUsageValue phase="Running" isLoading />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says Not reported when the run does not meter its context", () => {
    render(<ContextUsageValue phase="Running" usage={{ inputTokens: 10 }} />);
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says Unavailable when the runs could not be read", () => {
    render(<ContextUsageValue phase="Failed" isUnavailable />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says a running stage has no usage yet until it reports any, never Not reported", () => {
    const { rerender } = render(
      <ContextUsageValue
        phase="Running"
        usage={{ contextSize: 200_000, maxTurns: 50, model: "m" }}
      />
    );
    expect(screen.getByText("Not reported yet")).toBeInTheDocument();
    expect(screen.queryByText("Not reported")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    // Values show as soon as they exist, whatever says when they came.
    rerender(<ContextUsageValue phase="Running" usage={usage(121_400)} />);
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    // A finished stage that never reported has nothing more to wait for.
    rerender(
      <ContextUsageValue phase="Failed" usage={{ contextSize: 200_000 }} />
    );
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("renders nothing for a pending stage", () => {
    render(<ContextUsageValue phase="Pending" usage={usage(10)} />);
    expect(screen.queryByText(/tokens/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("ContextUsageCell", () => {
  it("shows the percent, with the stage and tokens for assistive tech", () => {
    render(
      <ContextUsageCell
        stageName="Migrate"
        phase="Running"
        usage={usage(121_400)}
      />
    );
    const bar = screen.getByRole("progressbar", {
      name: "Context window of Migrate",
    });
    expect(bar).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("stays neutral near the limit, like the stage page", () => {
    render(
      <ContextUsageCell
        stageName="Migrate"
        phase="Running"
        usage={usage(190_000)}
      />
    );
    expect(progressClass(screen.getByRole("progressbar"))).not.toMatch(
      /pf-m-(warning|danger)/
    );
  });

  it("says Not started, Not reported or Unavailable instead of a bar", () => {
    const { rerender } = render(
      <ContextUsageCell stageName="Validate" phase="Pending" />
    );
    expect(screen.getByText("Not started")).toBeInTheDocument();
    rerender(<ContextUsageCell stageName="Validate" phase="Succeeded" />);
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    rerender(
      <ContextUsageCell stageName="Validate" phase="Succeeded" isUnavailable />
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    rerender(<ContextUsageCell stageName="Validate" phase="Running" />);
    expect(screen.getByText("Not reported yet")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
