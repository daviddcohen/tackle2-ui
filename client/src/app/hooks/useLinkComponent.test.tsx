import * as React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { LocationDescriptor } from "history";
import { MemoryRouter } from "react-router-dom";
import { Button } from "@patternfly/react-core";

import { useLinkComponent } from "./useLinkComponent";

describe("useLinkComponent", () => {
  it("keeps one component type while the target is the same", () => {
    const { result, rerender } = renderHook(
      ({ to }: { to?: LocationDescriptor }) => useLinkComponent(to),
      {
        initialProps: {
          to: { pathname: "/plan-runs/1", state: { a: 1 } },
        } as { to?: LocationDescriptor },
      }
    );
    const first = result.current;
    // Callers build a new location object on every render.
    rerender({ to: { pathname: "/plan-runs/1", state: { a: 1 } } });
    expect(result.current).toBe(first);
    rerender({ to: { pathname: "/plan-runs/2", state: { a: 1 } } });
    expect(result.current).not.toBe(first);
    rerender({ to: undefined });
    expect(result.current).toBeUndefined();
  });

  it("renders a PatternFly button as a router link to the target", () => {
    const LinkButton: React.FC = () => (
      <Button variant="link" component={useLinkComponent("/plan-runs/1?a=b")}>
        Review stage
      </Button>
    );
    render(
      <MemoryRouter>
        <LinkButton />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "Review stage" });
    expect(link).toHaveAttribute("href", "/plan-runs/1?a=b");
    expect(link).toHaveClass("pf-v6-c-button", "pf-m-link");
  });
});
