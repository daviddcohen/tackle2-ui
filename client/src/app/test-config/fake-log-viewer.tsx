/**
 * A stand-in for `@patternfly/react-log-viewer` in jsdom, where `LogViewer`
 * cannot lay out its virtualized list (it measures text with a canvas).
 *
 * Use it with:
 * `jest.mock("@patternfly/react-log-viewer", () => jest.requireActual("@app/test-config/fake-log-viewer"));`
 *
 * `LogViewer` renders its toolbar, header and lines, and keeps the props of
 * its last render in `fakeLogViewer.props` (read `scrollToRow`, call
 * `onScroll` to simulate scrolling). Its ref's `scrollToItem` is
 * `fakeLogViewer.scrollToItem`. `LogViewerSearch` is a plain search box with
 * next and previous buttons that call the given handlers. Like the real
 * one, the toolbar sees the search through `LogViewerToolbarContext`: the
 * lines containing the text are the matches, the first one is in focus and
 * Next moves to the next one.
 */
import * as React from "react";
import type {
  LogViewerProps,
  LogViewerSearchProps,
} from "@patternfly/react-log-viewer";

export const fakeLogViewer: {
  props?: LogViewerProps;
  scrollToItem: jest.Mock;
} = {
  props: undefined,
  scrollToItem: jest.fn(),
};

export const resetFakeLogViewer = () => {
  fakeLogViewer.props = undefined;
  fakeLogViewer.scrollToItem.mockReset();
};

interface FakeSearch {
  searchedInput: string;
  searchedWordIndexes: { rowIndex: number; matchIndex: number }[];
  rowInFocus: { rowIndex: number; matchIndex: number };
  search: (input: string) => void;
  next: () => void;
}

export const LogViewerToolbarContext = React.createContext<FakeSearch | null>(
  null
);

export const LogViewer = React.forwardRef<unknown, LogViewerProps>(
  (props, ref) => {
    React.useEffect(() => {
      fakeLogViewer.props = props;
    });
    React.useImperativeHandle(ref, () => ({
      scrollToItem: fakeLogViewer.scrollToItem,
    }));
    const lines = Array.isArray(props.data)
      ? props.data
      : (props.data ?? "").split("\n");
    const [searchedInput, setSearchedInput] = React.useState("");
    const [focus, setFocus] = React.useState(0);
    const matches =
      searchedInput === ""
        ? []
        : lines.flatMap((line, rowIndex) =>
            line.includes(searchedInput) ? [{ rowIndex, matchIndex: 0 }] : []
          );
    const search: FakeSearch = {
      searchedInput,
      searchedWordIndexes: matches,
      rowInFocus: matches[focus] ?? { rowIndex: -1, matchIndex: -1 },
      search: (input) => {
        setSearchedInput(input);
        setFocus(0);
      },
      next: () =>
        setFocus((index) => (index + 1) % Math.max(1, matches.length)),
    };
    return (
      <div data-testid="log-viewer">
        <LogViewerToolbarContext.Provider value={search}>
          {props.toolbar}
        </LogViewerToolbarContext.Provider>
        {props.header}
        <ol aria-label="log lines">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
      </div>
    );
  }
);
LogViewer.displayName = "FakeLogViewer";

export const LogViewerSearch: React.FC<LogViewerSearchProps> = ({
  placeholder,
  onChange,
  onNextClick,
  onPreviousClick,
  "aria-label": ariaLabel,
}) => {
  const [value, setValue] = React.useState("");
  const search = React.useContext(LogViewerToolbarContext);
  return (
    <div>
      <input
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          search?.search(event.target.value);
          onChange?.(
            event as React.FormEvent<HTMLInputElement>,
            event.target.value
          );
        }}
      />
      <button
        type="button"
        onClick={(event) => onPreviousClick?.(event as never)}
      >
        Previous
      </button>
      <button
        type="button"
        onClick={(event) => {
          search?.next();
          onNextClick?.(event as never);
        }}
      >
        Next
      </button>
    </div>
  );
};
