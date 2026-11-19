import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Switch } from "react-router-dom";

import { Paths } from "@app/Paths";
import { Application, Task } from "@app/api/models";
import {
  getApplicationById,
  getTaskById,
  getTaskByIdAndFormat,
  getTextFileById,
} from "@app/api/rest";

import { TaskDetails } from "./TaskDetails";

jest.mock("@monaco-editor/react", () =>
  jest.requireActual("@app/test-config/fake-monaco-editor")
);

jest.mock("@app/api/rest", () => ({
  ...jest.requireActual("@app/api/rest"),
  getApplicationById: jest.fn(),
  getTaskById: jest.fn(),
  getTaskByIdAndFormat: jest.fn(),
  getTextFileById: jest.fn(),
}));

// TaskDetails reads window.location, so drive the real browser history
const renderAt = (path: string) => {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route
            path={Paths.applicationsTaskDetailsAttachment}
            component={TaskDetails}
          />
          <Route path={Paths.applicationsTaskDetails} component={TaskDetails} />
          <Route path={Paths.taskDetailsAttachment} component={TaskDetails} />
          <Route path={Paths.taskDetails} component={TaskDetails} />
        </Switch>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

const selectAttachment = async () => {
  const user = userEvent.setup();
  await screen.findByText("state: Succeeded");
  await user.click(screen.getByRole("button", { name: "Attachment toggle" }));
  await user.click(await screen.findByRole("option", { name: "report.txt" }));
};

describe("TaskDetails attachment links", () => {
  beforeEach(() => {
    jest.mocked(getApplicationById).mockResolvedValue({
      id: 5,
      name: "app",
    } as Application);
    jest.mocked(getTaskById).mockResolvedValue({
      id: 42,
      name: "analysis",
      state: "Succeeded",
      attached: [{ id: 7, name: "report.txt" }],
    } as Task<object>);
    jest.mocked(getTaskByIdAndFormat).mockResolvedValue("state: Succeeded");
    jest.mocked(getTextFileById).mockResolvedValue("report");
  });

  it("keeps the application in the path of an application's task", async () => {
    renderAt("/applications/5/tasks/42");
    await selectAttachment();

    expect(window.location.pathname).toBe(
      "/applications/5/tasks/42/attachments/7"
    );
    expect(await screen.findByText("report")).toBeInTheDocument();
  });

  it("links to the task manager path for a task opened from the task manager", async () => {
    renderAt("/tasks/42");
    await selectAttachment();

    expect(window.location.pathname).toBe("/tasks/42/attachments/7");
  });
});
