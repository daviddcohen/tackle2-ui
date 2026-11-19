import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getTaskByIdAndFormat, getTextFileById } from "@app/api/rest";
import type { FakeEditor } from "@app/test-config/fake-monaco-editor";

import { ISimpleDocumentViewerProps, SimpleDocumentViewer } from ".";

jest.mock("@monaco-editor/react", () =>
  jest.requireActual("@app/test-config/fake-monaco-editor")
);

jest.mock("@app/api/rest", () => ({
  ...jest.requireActual("@app/api/rest"),
  getTaskByIdAndFormat: jest.fn(),
  getTextFileById: jest.fn(),
}));

const fetchTaskDocument = jest.mocked(getTaskByIdAndFormat);
const fetchFile = jest.mocked(getTextFileById);

const { mountedEditors, resetFakeEditors } = jest.requireMock(
  "@monaco-editor/react"
) as { mountedEditors: FakeEditor[]; resetFakeEditors: () => void };
const lastEditor = () => mountedEditors[mountedEditors.length - 1];

const ATTACHMENT = { id: 7, name: "report.yaml" };

const renderViewer = (props: Partial<ISimpleDocumentViewerProps> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const defaults: ISimpleDocumentViewerProps = {
    taskId: 42,
    documentId: "LOG_VIEW",
    attachments: [],
  };
  const view = render(<SimpleDocumentViewer {...defaults} {...props} />, {
    wrapper,
  });
  return {
    ...view,
    rerender: (next: Partial<ISimpleDocumentViewerProps>) =>
      view.rerender(
        <SimpleDocumentViewer {...defaults} {...props} {...next} />
      ),
  };
};

describe("SimpleDocumentViewer", () => {
  beforeEach(() => {
    resetFakeEditors();
    fetchFile.mockResolvedValue("kind: report");
  });

  it("keeps the editor and the language when the attachments change", async () => {
    fetchTaskDocument.mockResolvedValue("state: Running");
    const user = userEvent.setup();
    const { rerender } = renderViewer();
    await screen.findByText("state: Running");

    await user.click(screen.getByRole("button", { name: "YAML" }));
    await waitFor(() =>
      expect(fetchTaskDocument).toHaveBeenLastCalledWith(42, "yaml", false)
    );
    await screen.findByText("state: Running");
    const editor = lastEditor();

    rerender({ attachments: [ATTACHMENT] });

    expect(lastEditor()).toBe(editor);
    expect(screen.getByRole("button", { name: "YAML" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows the attachment named by documentId once it is known", async () => {
    fetchTaskDocument.mockResolvedValue("state: Running");
    const { rerender } = renderViewer({ documentId: "LOG_VIEW" });
    await screen.findByText("state: Running");

    rerender({ documentId: ATTACHMENT.id, attachments: [ATTACHMENT] });

    expect(await screen.findByText("kind: report")).toBeInTheDocument();
    expect(fetchFile).toHaveBeenCalledWith(ATTACHMENT.id);
  });

  it("fetches the document once more when polling stops", async () => {
    fetchTaskDocument.mockResolvedValue("state: Running");
    const { rerender } = renderViewer({ refetchInterval: 60_000 });
    await screen.findByText("state: Running");
    expect(fetchTaskDocument).toHaveBeenCalledTimes(1);

    rerender({ refetchInterval: false });

    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(2));
  });

  it("calls onRefresh with the document refetch from the Refresh control", async () => {
    fetchTaskDocument.mockResolvedValue("state: Running");
    const onRefresh = jest.fn();
    const user = userEvent.setup();
    renderViewer({ onRefresh });
    await screen.findByText("state: Running");

    await user.click(screen.getByRole("button", { name: "refresh-task" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(2));
  });

  describe("when the shown document grows", () => {
    const refreshWithMoreLines = async (lastVisibleLine: number) => {
      fetchTaskDocument
        .mockResolvedValueOnce("line 1\nline 2")
        .mockResolvedValue("line 1\nline 2\nline 3\nline 4");
      const user = userEvent.setup();
      renderViewer();
      await waitFor(() => expect(lastEditor()?.value).toBe("line 1\nline 2"));
      const editor = lastEditor();
      editor.lastVisibleLine = lastVisibleLine;

      await user.click(screen.getByRole("button", { name: "refresh-task" }));
      await waitFor(() => expect(editor.value).toContain("line 4"));
      expect(lastEditor()).toBe(editor);
      return editor;
    };

    it("follows the tail when the reader was at the end", async () => {
      const editor = await refreshWithMoreLines(2);

      expect(editor.revealLine).toHaveBeenCalledWith(4);
      expect(editor.restoreViewState).not.toHaveBeenCalled();
    });

    it("keeps the reader's place when they scrolled up", async () => {
      const editor = await refreshWithMoreLines(1);

      expect(editor.restoreViewState).toHaveBeenCalledWith({
        lastVisibleLine: 1,
      });
      expect(editor.revealLine).not.toHaveBeenCalled();
    });
  });
});
