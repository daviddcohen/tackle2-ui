import { AgentRunUsage } from "@app/agentic";
import { render, screen } from "@app/test-config/test-utils";

import { ContextUsage, ContextUsageCell } from "./context-usage";

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

describe("ContextUsage", () => {
  it("shows the tokens and percent of a running stage", () => {
    render(<ContextUsage phase="Running" usage={usage(121_400)} />);
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(bar).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    expect(progressClass(bar)).not.toMatch(/pf-m-(warning|danger)/);
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
  });

  it("stays neutral at every level, with no status icon", () => {
    render(<ContextUsage phase="Running" usage={usage(172_000)} />);
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(progressClass(bar)).not.toMatch(/pf-m-(warning|danger)/);
    expect(
      bar
        .closest(".pf-v6-c-progress")
        ?.querySelector(".pf-v6-c-progress__status-icon")
    ).toBeNull();
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
  });

  it("says nearly full from 95 % while running, still neutral", () => {
    render(<ContextUsage phase="Running" usage={usage(194_000)} />);
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(progressClass(bar)).not.toMatch(/pf-m-(warning|danger)/);
    const helper = screen.getByText(
      "Context nearly full. The agent compacts its context automatically."
    );
    expect(bar).toHaveAttribute("aria-describedby", helper.closest("[id]")?.id);
  });

  it("keeps one helper line while running, so crossing 95 % does not move the page", () => {
    const { rerender } = render(<ContextUsage phase="Running" isLoading />);
    const below =
      "The agent compacts its context automatically when it gets full.";
    expect(screen.getByText(below)).toBeInTheDocument();
    rerender(<ContextUsage phase="Running" usage={{ contextSize: 200_000 }} />);
    expect(screen.getByText(below)).toBeInTheDocument();
    rerender(<ContextUsage phase="Running" usage={usage(121_400)} />);
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(bar).toHaveAttribute(
      "aria-describedby",
      screen.getByText(below).closest("[id]")?.id
    );
    rerender(<ContextUsage phase="Running" usage={usage(194_000)} />);
    expect(screen.queryByText(below)).toBeNull();
    expect(
      screen.getAllByText(/compacts its context automatically/)
    ).toHaveLength(1);
    // A finished stage has no helper line: its height does not change.
    rerender(<ContextUsage phase="Succeeded" usage={usage(194_000)} />);
    expect(screen.queryByText(/compacts its context automatically/)).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).not.toHaveAttribute("aria-describedby");
  });

  it("is neutral and adds the peak once the stage stopped", () => {
    render(
      <ContextUsage
        phase="Succeeded"
        usage={usage(194_000, { peakContextUsed: 196_500 })}
      />
    );
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(progressClass(bar)).not.toMatch(/pf-m-(warning|danger)/);
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      "194K of 200K tokens (97%) · Peak 197K"
    );
    expect(screen.queryByText(/Context nearly full/)).toBeNull();
  });

  it("leaves out a peak equal to the last value", () => {
    render(
      <ContextUsage
        phase="Failed"
        usage={usage(123_000, { peakContextUsed: 123_400 })}
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", "123K of 200K tokens (61%)");
  });

  it("says Not reported when the run does not meter its context", () => {
    render(<ContextUsage phase="Running" usage={{ inputTokens: 10 }} />);
    expect(screen.getByText("Context window")).toBeInTheDocument();
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says Unavailable when the runs could not be read", () => {
    render(<ContextUsage phase="Failed" isUnavailable />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("holds the bar's place while loading", () => {
    render(<ContextUsage phase="Running" isLoading />);
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", "Loading context usage");
  });

  it("says a running stage has no usage yet until it reports any, never Not reported", () => {
    const { rerender } = render(
      <ContextUsage
        phase="Running"
        usage={{ contextSize: 200_000, maxTurns: 50, model: "m" }}
      />
    );
    const bar = screen.getByRole("progressbar", { name: "Context window" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Not reported yet");
    expect(screen.queryByText("Not reported")).toBeNull();
    // Values show as soon as they exist, whatever says when they came.
    rerender(<ContextUsage phase="Running" usage={usage(121_400)} />);
    expect(
      screen.getByRole("progressbar", { name: "Context window" })
    ).toHaveAttribute("aria-valuetext", "121K of 200K tokens (60%)");
    // A finished stage that never reported has nothing more to wait for.
    rerender(<ContextUsage phase="Failed" usage={{ contextSize: 200_000 }} />);
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("renders nothing for a pending stage", () => {
    const { container } = render(
      <ContextUsage phase="Pending" usage={usage(10)} />
    );
    expect(container).toBeEmptyDOMElement();
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
