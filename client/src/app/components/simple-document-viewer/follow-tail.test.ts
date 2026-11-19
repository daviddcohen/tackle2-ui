import { renderHook } from "@testing-library/react";

import {
  CodeEditorInstance,
  TailFollowingEditor,
  applyViewSnapshot,
  isTailVisible,
  takeViewSnapshot,
  useKeepEditorPlace,
} from "./follow-tail";

const editorShowing = (
  lineCount: number,
  lastVisibleLine?: number
): jest.Mocked<TailFollowingEditor<{ top: number }>> => ({
  getModel: jest.fn(() => ({ getLineCount: () => lineCount })),
  getVisibleRanges: jest.fn(() =>
    lastVisibleLine == null
      ? []
      : [{ endLineNumber: 1 }, { endLineNumber: lastVisibleLine }]
  ),
  saveViewState: jest.fn(() => ({ top: 120 })),
  restoreViewState: jest.fn(),
  revealLine: jest.fn(),
});

describe("isTailVisible", () => {
  it.each`
    lastVisibleLine | lineCount | expected
    ${10}           | ${10}     | ${true}
    ${12}           | ${10}     | ${true}
    ${9}            | ${10}     | ${false}
    ${undefined}    | ${10}     | ${true}
  `(
    "last visible line $lastVisibleLine of $lineCount: $expected",
    ({ lastVisibleLine, lineCount, expected }) => {
      expect(isTailVisible(lastVisibleLine, lineCount)).toBe(expected);
    }
  );
});

describe("takeViewSnapshot / applyViewSnapshot", () => {
  it("follows the tail when the reader was at the end", () => {
    const before = editorShowing(10, 10);
    const snapshot = takeViewSnapshot(before);
    expect(snapshot).toEqual({ follow: true });

    const after = editorShowing(25, 10);
    applyViewSnapshot(after, snapshot!);
    expect(after.revealLine).toHaveBeenCalledWith(25);
    expect(after.restoreViewState).not.toHaveBeenCalled();
  });

  it("keeps the reader's place when they scrolled up", () => {
    const before = editorShowing(10, 4);
    const snapshot = takeViewSnapshot(before);
    expect(snapshot).toEqual({ follow: false, viewState: { top: 120 } });

    const after = editorShowing(25, 1);
    applyViewSnapshot(after, snapshot!);
    expect(after.restoreViewState).toHaveBeenCalledWith({ top: 120 });
    expect(after.revealLine).not.toHaveBeenCalled();
  });

  it("takes no snapshot without a model", () => {
    const editor = editorShowing(10, 10);
    editor.getModel.mockReturnValue(null);
    expect(takeViewSnapshot(editor)).toBeUndefined();
  });
});

describe("useKeepEditorPlace", () => {
  /** An editor whose content the test replaces, as `CodeEditor` does. */
  const fakeEditor = (lineCount: number, lastVisibleLine?: number) => {
    const listeners: (() => void)[] = [];
    const editor = {
      ...editorShowing(lineCount, lastVisibleLine),
      onDidChangeModelContent: (listener: () => void) => {
        listeners.push(listener);
        return { dispose: () => undefined };
      },
    };
    const contentChanged = () => listeners.forEach((listener) => listener());
    return { editor, contentChanged };
  };

  const mount = (
    editor: ReturnType<typeof fakeEditor>["editor"],
    initial: { documentKey: string; code?: string }
  ) => {
    const view = renderHook(
      ({ documentKey, code }) => useKeepEditorPlace(documentKey, code),
      { initialProps: initial }
    );
    view.result.current(editor as unknown as CodeEditorInstance);
    return view;
  };

  it("follows the tail when a refresh grows a document read at its end", () => {
    const { editor, contentChanged } = fakeEditor(2, 2);
    const { rerender } = mount(editor, { documentKey: "log", code: "a\nb" });
    rerender({ documentKey: "log", code: "a\nb\nc" });
    contentChanged();
    expect(editor.revealLine).toHaveBeenCalled();
    expect(editor.restoreViewState).not.toHaveBeenCalled();
  });

  it("keeps the reader's view when they scrolled up", () => {
    const { editor, contentChanged } = fakeEditor(10, 4);
    const { rerender } = mount(editor, { documentKey: "log", code: "a" });
    rerender({ documentKey: "log", code: "a\nb" });
    contentChanged();
    expect(editor.restoreViewState).toHaveBeenCalledWith({ top: 120 });
  });

  it("leaves a new document or language alone", () => {
    const { editor, contentChanged } = fakeEditor(10, 4);
    const { rerender } = mount(editor, { documentKey: "log/yaml", code: "a" });
    rerender({ documentKey: "log/json", code: "{}" });
    contentChanged();
    expect(editor.restoreViewState).not.toHaveBeenCalled();
    expect(editor.revealLine).not.toHaveBeenCalled();
  });
});
