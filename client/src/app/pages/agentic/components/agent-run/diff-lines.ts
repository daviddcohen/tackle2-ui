import { TranscriptDiff } from "@app/agentic";

/** Unchanged lines kept around a change, as `diff -u` does. */
const CONTEXT_LINES = 3;

/**
 * Above this many line pairs the diff does not look for lines kept between
 * changes: everything between the shared start and end shows as changed.
 */
const MAX_LCS_CELLS = 1_000_000;

export type DiffLine =
  | { kind: "context" | "removed" | "added"; text: string }
  /** Unchanged lines left out between two changes. */
  | { kind: "skipped" };

const splitLines = (text: string | undefined) => {
  if (text == null || text === "") return [];
  const lines = text.split("\n");
  // A trailing newline ends the last line; it does not start a new one.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/**
 * The lines of `before` and `after` in order, each kept, removed or added,
 * by their longest common subsequence: an edit in two places shows as two
 * changes, not as one block.
 */
const compare = (before: string[], after: string[]): DiffLine[] => {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start++;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  const old = before.slice(start, before.length - end);
  const next = after.slice(start, after.length - end);
  const middle: DiffLine[] = [];
  if (old.length * next.length > MAX_LCS_CELLS) {
    old.forEach((text) => middle.push({ kind: "removed", text }));
    next.forEach((text) => middle.push({ kind: "added", text }));
  } else {
    // lengths[i][j]: common lines of old[i..] and next[j..].
    const lengths = Array.from({ length: old.length + 1 }, () =>
      new Array<number>(next.length + 1).fill(0)
    );
    for (let i = old.length - 1; i >= 0; i--) {
      for (let j = next.length - 1; j >= 0; j--) {
        lengths[i][j] =
          old[i] === next[j]
            ? lengths[i + 1][j + 1] + 1
            : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < old.length || j < next.length) {
      if (i < old.length && j < next.length && old[i] === next[j]) {
        middle.push({ kind: "context", text: old[i] });
        i++;
        j++;
      } else if (
        j >= next.length ||
        (i < old.length && lengths[i + 1][j] >= lengths[i][j + 1])
      ) {
        middle.push({ kind: "removed", text: old[i] });
        i++;
      } else {
        middle.push({ kind: "added", text: next[j] });
        j++;
      }
    }
  }
  return [
    ...before
      .slice(0, start)
      .map((text) => ({ kind: "context" as const, text })),
    ...middle,
    ...before
      .slice(before.length - end)
      .map((text) => ({ kind: "context" as const, text })),
  ];
};

/**
 * A file change as diff lines: removed and added lines with up to three
 * unchanged lines around each change; longer unchanged runs between changes
 * are left out (`skipped`). No `oldText` means a new file: every line is
 * added. Agents edit files by snippet, so there are no line numbers: the
 * snippet's lines are not the file's.
 */
export const diffLines = ({ oldText, newText }: TranscriptDiff): DiffLine[] => {
  const lines = compare(splitLines(oldText), splitLines(newText));
  const changed = lines.map((line) => line.kind !== "context");
  const lastChange = changed.lastIndexOf(true);
  const isNearChange = (index: number) =>
    changed
      .slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1)
      .some(Boolean);
  const shown: DiffLine[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== "context" || isNearChange(index)) {
      shown.push(line);
    } else if (
      shown.length > 0 &&
      shown[shown.length - 1].kind !== "skipped" &&
      index < lastChange
    ) {
      shown.push({ kind: "skipped" });
    }
  });
  return shown;
};

/** A diff line as text: `-` removed, `+` added, a space unchanged. */
export const diffLineText = (line: DiffLine) =>
  line.kind === "skipped"
    ? "..."
    : `${line.kind === "removed" ? "-" : line.kind === "added" ? "+" : " "}${line.text}`;
