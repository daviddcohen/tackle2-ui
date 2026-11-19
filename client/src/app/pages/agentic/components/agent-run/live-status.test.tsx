import { act, render, screen } from "@testing-library/react";

import { UpdatedAgo } from "./live-status";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

describe("UpdatedAgo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-17T09:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts seconds, then minutes from a minute on", () => {
    render(<UpdatedAgo updatedAt={Date.now()} />);
    expect(screen.getByText("Updated just now.")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Updated 1 second ago.")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(58_000);
    });
    expect(screen.getByText("Updated 59 seconds ago.")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Updated 1 minute ago.")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(14 * 60_000);
    });
    expect(screen.getByText("Updated 15 minutes ago.")).toBeInTheDocument();
  });
});
