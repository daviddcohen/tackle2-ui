/**
 * A stand-in for `@monaco-editor/react` in jsdom, where Monaco cannot load.
 *
 * Use it with:
 * `jest.mock("@monaco-editor/react", () => jest.requireActual("@app/test-config/fake-monaco-editor"));`
 *
 * It renders the value in a `<pre>` and hands `onMount` a fake editor that
 * models what the code under test needs: the line count, the last visible line
 * (set `lastVisibleLine` to simulate scrolling; `undefined` means everything is
 * visible), view state and content change listeners.
 */
import { useEffect, useRef } from "react";

export interface FakeEditor {
  value: string;
  lastVisibleLine?: number;
  getModel: () => { getLineCount: () => number };
  getVisibleRanges: () => { endLineNumber: number }[];
  saveViewState: jest.Mock;
  restoreViewState: jest.Mock;
  revealLine: jest.Mock;
  focus: jest.Mock;
  setPosition: jest.Mock;
  addCommand: jest.Mock;
  layout: jest.Mock;
  getLayoutInfo: () => { width: number; height: number };
  getContentHeight: () => number;
  onDidChangeModelContent: (listener: () => void) => { dispose: () => void };
  setValue: (value: string) => void;
}

/** Every editor mounted since the last `resetFakeEditors()`, oldest first. */
export const mountedEditors: FakeEditor[] = [];

export const resetFakeEditors = () => {
  mountedEditors.length = 0;
};

const createFakeEditor = (value: string): FakeEditor => {
  const listeners = new Set<() => void>();
  const editor: FakeEditor = {
    value,
    lastVisibleLine: undefined,
    getModel: () => ({ getLineCount: () => editor.value.split("\n").length }),
    getVisibleRanges: () =>
      editor.lastVisibleLine == null
        ? []
        : [{ endLineNumber: editor.lastVisibleLine }],
    saveViewState: jest.fn(() => ({ lastVisibleLine: editor.lastVisibleLine })),
    restoreViewState: jest.fn(),
    revealLine: jest.fn(),
    focus: jest.fn(),
    setPosition: jest.fn(),
    addCommand: jest.fn(),
    layout: jest.fn(),
    getLayoutInfo: () => ({ width: 800, height: 400 }),
    getContentHeight: () => 400,
    onDidChangeModelContent: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    setValue: (next) => {
      editor.value = next;
      listeners.forEach((listener) => listener());
    },
  };
  return editor;
};

const fakeMonaco = {
  KeyMod: { Shift: 1 },
  KeyCode: { Tab: 2 },
  editor: { defineTheme: jest.fn() },
};

const FakeMonacoEditor = ({
  value = "",
  language,
  height,
  beforeMount,
  onMount,
}: {
  value?: string;
  language?: string;
  /** The height the editor was given, in `data-height`. */
  height?: string | number;
  beforeMount?: (monaco: typeof fakeMonaco) => void;
  onMount?: (editor: FakeEditor, monaco: typeof fakeMonaco) => void;
}) => {
  const editorRef = useRef<FakeEditor>();

  useEffect(() => {
    beforeMount?.(fakeMonaco);
    const editor = createFakeEditor(value);
    editorRef.current = editor;
    mountedEditors.push(editor);
    onMount?.(editor, fakeMonaco);
    // mount once, like the real editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.value !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  return (
    <pre
      data-testid="code-editor"
      data-language={language}
      data-height={height}
    >
      {value}
    </pre>
  );
};

export default FakeMonacoEditor;
