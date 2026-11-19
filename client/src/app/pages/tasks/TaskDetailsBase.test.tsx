import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { Task } from "@app/api/models";
import {
  getTaskById,
  getTaskByIdAndFormat,
  getTextFileById,
} from "@app/api/rest";

import { TaskDetailsBase } from "./TaskDetailsBase";

jest.mock("@monaco-editor/react", () =>
  jest.requireActual("@app/test-config/fake-monaco-editor")
);

jest.mock("@app/api/rest", () => ({
  ...jest.requireActual("@app/api/rest"),
  getTaskById: jest.fn(),
  getTaskByIdAndFormat: jest.fn(),
  getTextFileById: jest.fn(),
}));

const fetchTask = jest.mocked(getTaskById);
const fetchTaskDocument = jest.mocked(getTaskByIdAndFormat);
const fetchFile = jest.mocked(getTextFileById);

const POLL = 5000;

const task = (state: Task<object>["state"], attachments = 0): Task<object> =>
  ({
    id: 42,
    name: "analysis",
    state,
    attached: Array.from({ length: attachments }, (_, i) => ({
      id: 100 + i,
      name: `attachment-${i}.txt`,
    })),
  }) as Task<object>;

const renderDetails = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/tasks/42"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(
    <TaskDetailsBase
      breadcrumbs={[]}
      formatTitle={(name) => `Task ${name}`}
      detailsPath="/tasks/42"
      formatAttachmentPath={(id) => `/tasks/42/attachments/${id}`}
      taskId={42}
    />,
    { wrapper }
  );
};

/** Advance the clock a second at a time, letting React apply each update. */
const advance = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  }
};

describe("TaskDetailsBase auto-refresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchTaskDocument.mockResolvedValue("state: Running");
    fetchFile.mockResolvedValue("file");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("polls the task and the log while the task is running", async () => {
    fetchTask.mockResolvedValue(task("Running"));
    renderDetails();

    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(1));
    expect(fetchTask).toHaveBeenCalledTimes(1);

    await advance(POLL);
    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(fetchTaskDocument).toHaveBeenCalledTimes(2);

    await advance(POLL);
    expect(fetchTask).toHaveBeenCalledTimes(3);
    expect(fetchTaskDocument).toHaveBeenCalledTimes(3);
  });

  it("stops polling once the task is terminal, after one last log fetch", async () => {
    fetchTask
      .mockResolvedValueOnce(task("Running"))
      .mockResolvedValue(task("Succeeded"));
    renderDetails();
    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(1));

    await advance(POLL);
    expect(fetchTask).toHaveBeenCalledTimes(2);
    // the poll at 5 s plus the final fetch when polling stopped
    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(3));

    await advance(POLL * 4);
    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(fetchTaskDocument).toHaveBeenCalledTimes(3);
  });

  it("shows the new log text after each poll, in the same editor", async () => {
    const { mountedEditors, resetFakeEditors } = jest.requireMock(
      "@monaco-editor/react"
    );
    resetFakeEditors();
    fetchTask.mockResolvedValue(task("Running"));
    fetchTaskDocument
      .mockResolvedValueOnce("state: Running")
      .mockResolvedValueOnce("state: Running\nline 2")
      .mockResolvedValue("state: Running\nline 2\nline 3");
    renderDetails();
    const editor = await screen.findByTestId("code-editor");
    expect(editor).toHaveTextContent("state: Running");
    const editorsBefore = mountedEditors.length;

    await advance(POLL);
    await waitFor(() =>
      expect(screen.getByTestId("code-editor")).toHaveTextContent("line 2")
    );
    await advance(POLL);
    await waitFor(() =>
      expect(screen.getByTestId("code-editor")).toHaveTextContent("line 3")
    );
    // Updated in place: the viewer is not re-created by the poll.
    expect(mountedEditors).toHaveLength(editorsBefore);
    expect(mountedEditors[mountedEditors.length - 1].value).toBe(
      "state: Running\nline 2\nline 3"
    );
  });

  it("does not poll a task that is already terminal", async () => {
    fetchTask.mockResolvedValue(task("Failed"));
    renderDetails();
    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(1));

    await advance(POLL * 4);
    expect(fetchTask).toHaveBeenCalledTimes(1);
    expect(fetchTaskDocument).toHaveBeenCalledTimes(1);
  });

  it("stops polling when fetching the task fails", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchTask
      .mockResolvedValueOnce(task("Running"))
      .mockRejectedValue(new Error("boom"));
    renderDetails();
    await waitFor(() => expect(fetchTaskDocument).toHaveBeenCalledTimes(1));

    await advance(POLL);
    expect(fetchTask).toHaveBeenCalledTimes(2);

    await advance(POLL * 4);
    expect(fetchTask).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("shows new attachments without re-creating the viewer", async () => {
    const { mountedEditors, resetFakeEditors } = jest.requireMock(
      "@monaco-editor/react"
    );
    resetFakeEditors();
    fetchTask
      .mockResolvedValueOnce(task("Running"))
      .mockResolvedValue(task("Running", 1));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDetails();
    await screen.findByText("state: Running");

    // switching the language loads another document, so the editor remounts
    await user.click(screen.getByRole("button", { name: "YAML" }));
    await waitFor(() =>
      expect(fetchTaskDocument).toHaveBeenLastCalledWith(42, "yaml", false)
    );
    await screen.findByText("state: Running");
    const editorsBeforePoll = mountedEditors.length;

    await advance(POLL);
    await user.click(screen.getByRole("button", { name: "Attachment toggle" }));
    expect(
      await screen.findByRole("option", { name: "attachment-0.txt" })
    ).toBeInTheDocument();

    expect(mountedEditors).toHaveLength(editorsBeforePoll);
    expect(screen.getByRole("button", { name: "YAML" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("refreshes the task and the log from the Refresh control", async () => {
    fetchTask.mockResolvedValue(task("Succeeded"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDetails();
    await screen.findByText("state: Running");

    await user.click(screen.getByRole("button", { name: "refresh-task" }));

    await waitFor(() => expect(fetchTask).toHaveBeenCalledTimes(2));
    expect(fetchTaskDocument).toHaveBeenCalledTimes(2);
  });
});
