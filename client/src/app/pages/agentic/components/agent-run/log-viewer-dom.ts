/**
 * The parts of the PatternFly log viewer's DOM the Logs view reads, in one
 * place.
 *
 * `LogViewer` has no API for two things the view needs: which line is at
 * the top of the viewport (to keep the reader's place when wrapping
 * rebuilds the list) and a keyboard focusable scroll container (its
 * react-window list is not focusable, so arrow keys cannot scroll it). Both
 * read the rendered DOM. The class names come from the log viewer's own
 * style module, the one `LogViewer` renders with, never from string
 * literals, so a renamed class or a new prefix changes here with the
 * package. The e2e specs cover both behaviours against the real component.
 */
import logViewerStyles from "@patternfly/react-log-viewer/dist/esm/LogViewer/css/log-viewer";

/** The log viewer's body: its `height` prop sets this element's height. */
export const LOG_VIEWER_BODY_CLASS = logViewerStyles.logViewerMain;

const scrollContainerOf = (root: Element | null) =>
  root?.querySelector<HTMLElement>(
    `.${logViewerStyles.logViewerScrollContainer}`
  ) ?? null;

/** A rendered row: its line number (1-based) and where it ends on screen. */
export interface RenderedLogRow {
  lineNumber: number;
  bottom: number;
}

/**
 * The rows the log viewer under `root` has rendered, and the top of its
 * scroll container; undefined when no log viewer is rendered.
 */
export const renderedLogRows = (
  root: Element | null
): { rows: RenderedLogRow[]; top: number } | undefined => {
  const container = scrollContainerOf(root);
  if (container == null) return undefined;
  const rows = Array.from(
    container.querySelectorAll(`.${logViewerStyles.logViewerListItem}`)
  ).map((row) => ({
    lineNumber: Number(
      row.querySelector(`.${logViewerStyles.logViewerIndex}`)?.textContent
    ),
    bottom: row.getBoundingClientRect().bottom,
  }));
  return { rows, top: container.getBoundingClientRect().top };
};

/**
 * Lets keyboard users Tab into the log and scroll it with the arrow keys.
 * The focus stop gets a role and `label`, so a screen reader names it
 * ("Agent log") instead of landing on an unnamed element.
 */
export const makeLogKeyboardScrollable = (
  root: Element | null,
  label: string
) => {
  const container = scrollContainerOf(root);
  if (container == null) return;
  container.setAttribute("tabindex", "0");
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", label);
};
