/**
 * Keep a read-only Monaco editor's place when its content is replaced.
 *
 * Monaco applies a new value to a read-only editor with `setValue`, which
 * flushes the model and moves the cursor and viewport back to line 1. For a
 * document that grows while it is shown (a running task's log), take a
 * snapshot before the new value lands and apply it right after:
 *
 * - the reader could see the last line: follow the tail (reveal the new last line)
 * - the reader scrolled up: restore their view state (scroll and cursor)
 *
 * `useKeepEditorPlace` does both around a `CodeEditor`.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import type { CodeEditorProps } from "@patternfly/react-code-editor";

/** The subset of the Monaco editor API used to follow the tail. */
export interface TailFollowingEditor<ViewState = unknown> {
  getModel: () => { getLineCount: () => number } | null;
  getVisibleRanges: () => { endLineNumber: number }[];
  saveViewState: () => ViewState | null;
  restoreViewState: (state: ViewState | null) => void;
  revealLine: (lineNumber: number) => void;
}

export type ViewSnapshot<ViewState = unknown> =
  | { follow: true }
  | { follow: false; viewState: ViewState | null };

/** True when the last line is visible (or nothing is laid out yet). */
export const isTailVisible = (
  lastVisibleLine: number | undefined,
  lineCount: number
) => lastVisibleLine == null || lastVisibleLine >= lineCount;

export const takeViewSnapshot = <ViewState>(
  editor: TailFollowingEditor<ViewState>
): ViewSnapshot<ViewState> | undefined => {
  const model = editor.getModel();
  if (!model) {
    return undefined;
  }
  const ranges = editor.getVisibleRanges();
  const lastVisibleLine = ranges[ranges.length - 1]?.endLineNumber;
  return isTailVisible(lastVisibleLine, model.getLineCount())
    ? { follow: true }
    : { follow: false, viewState: editor.saveViewState() };
};

export const applyViewSnapshot = <ViewState>(
  editor: TailFollowingEditor<ViewState>,
  snapshot: ViewSnapshot<ViewState>
) => {
  if (snapshot.follow) {
    const lineCount = editor.getModel()?.getLineCount();
    if (lineCount != null) {
      editor.revealLine(lineCount);
    }
  } else if (snapshot.viewState != null) {
    editor.restoreViewState(snapshot.viewState);
  }
};

/** The Monaco editor that the PatternFly `CodeEditor` hands to `onEditorDidMount`. */
export type CodeEditorInstance = Parameters<
  NonNullable<CodeEditorProps["onEditorDidMount"]>
>[0];
type CodeEditorViewState = NonNullable<
  ReturnType<CodeEditorInstance["saveViewState"]>
>;

/**
 * Keeps the reader's place in a read-only `CodeEditor` whose code is
 * replaced while it shows the same document (a refresh): before the new
 * code lands it notes whether the reader is at the end, and right after it
 * follows the tail or restores the reader's view. A new `documentKey` (another
 * document or language) starts at the top as usual.
 *
 * Returns the handler to call from `onEditorDidMount` with the editor.
 */
export const useKeepEditorPlace = (
  documentKey: string,
  code: string | undefined
) => {
  const editorRef = useRef<CodeEditorInstance>();
  const shown = useRef({ documentKey, code });
  const pendingSnapshot = useRef<ViewSnapshot<CodeEditorViewState>>();
  useLayoutEffect(() => {
    const previous = shown.current;
    shown.current = { documentKey, code };
    pendingSnapshot.current =
      editorRef.current != null &&
      previous.documentKey === documentKey &&
      previous.code &&
      code
        ? takeViewSnapshot(editorRef.current)
        : undefined;
  }, [code, documentKey]);

  return useCallback((editor: CodeEditorInstance) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => {
      const snapshot = pendingSnapshot.current;
      pendingSnapshot.current = undefined;
      if (snapshot) applyViewSnapshot(editor, snapshot);
    });
  }, []);
};
