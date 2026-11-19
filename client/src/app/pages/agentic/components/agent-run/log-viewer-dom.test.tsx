import logViewerStyles from "@patternfly/react-log-viewer/dist/esm/LogViewer/css/log-viewer";

import {
  LOG_VIEWER_BODY_CLASS,
  makeLogKeyboardScrollable,
  renderedLogRows,
} from "./log-viewer-dom";

/**
 * The real LogViewer cannot lay out in jsdom (it measures text with a
 * canvas), so the DOM is built here from the same style module it renders
 * with; the e2e specs run the helpers against the real component.
 */
const logViewer = (lineNumbers: number[]) => {
  const root = document.createElement("div");
  root.innerHTML = `
    <div class="${logViewerStyles.logViewer}">
      <div class="${logViewerStyles.logViewerMain}">
        <div class="${logViewerStyles.logViewerScrollContainer}">
          <div class="${logViewerStyles.logViewerList}">
            ${lineNumbers
              .map(
                (n) =>
                  `<div class="${logViewerStyles.logViewerListItem}"><span class="${logViewerStyles.logViewerIndex}">${n}</span><span>line ${n}</span></div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>`;
  return root;
};

describe("log viewer DOM helpers", () => {
  it("use the log viewer's own class names", () => {
    expect(LOG_VIEWER_BODY_CLASS).toBe(logViewerStyles.logViewerMain);
    // The PF 6 names the helpers were written against.
    expect(logViewerStyles.logViewerScrollContainer).toMatch(
      /^pf-v\d+-c-log-viewer__scroll-container$/
    );
  });

  it("read the rendered rows with their line numbers", () => {
    const rendered = renderedLogRows(logViewer([12, 13, 14]));
    expect(rendered?.rows.map((row) => row.lineNumber)).toEqual([12, 13, 14]);
    expect(rendered?.top).toBe(0);
  });

  it("find nothing without a log viewer", () => {
    expect(renderedLogRows(document.createElement("div"))).toBeUndefined();
    expect(renderedLogRows(null)).toBeUndefined();
    expect(() => makeLogKeyboardScrollable(null, "Agent log")).not.toThrow();
  });

  it("make the scroll container keyboard focusable, with a name", () => {
    const root = logViewer([1]);
    document.body.append(root);
    makeLogKeyboardScrollable(root, "Agent log");
    const container = root.querySelector(
      `.${logViewerStyles.logViewerScrollContainer}`
    );
    expect(container).toHaveAttribute("tabindex", "0");
    expect(container).toHaveAccessibleName("Agent log");
    expect(container).toHaveAttribute("role", "group");
    root.remove();
  });
});
