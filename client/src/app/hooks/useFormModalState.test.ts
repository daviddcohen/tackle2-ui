import { act, renderHook } from "@testing-library/react";

import { useFormModalState } from "./useFormModalState";

describe("useFormModalState", () => {
  it("changes the form key on every open, not on close", () => {
    const { result } = renderHook(() => useFormModalState<"create" | string>());
    expect(result.current[0]).toBeNull();
    const initialKey = result.current[2];

    act(() => result.current[1]("create"));
    expect(result.current[0]).toBe("create");
    const firstOpenKey = result.current[2];
    expect(firstOpenKey).not.toBe(initialKey);

    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(result.current[2]).toBe(firstOpenKey);

    act(() => result.current[1]("create"));
    expect(result.current[2]).not.toBe(firstOpenKey);
  });
});
