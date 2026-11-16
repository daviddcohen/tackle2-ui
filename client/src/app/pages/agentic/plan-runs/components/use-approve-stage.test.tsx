import { rest } from "msw";

import { StageRun } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import {
  act,
  createMockNotifications,
  renderHook,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { useApproveStage } from "./use-approve-stage";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const stageRun: StageRun = {
  stageId: "4",
  name: "Analyze",
  agent: { id: "1", name: "Migration Proposal Agent" },
  instructions: "",
  requiresApproval: true,
  order: 1,
  status: "AwaitingApproval",
};

const approveUrl = `${AGENTIC_ENDPOINTS.planRuns}/2/stages/4/approve`;

describe("useApproveStage", () => {
  it("approves the stage and says so by its name", async () => {
    server.use(
      rest.post(approveUrl, (_req, res, ctx) =>
        res(ctx.json({ id: "2", stageRuns: [] }))
      )
    );
    const notifications = createMockNotifications();
    const { result } = renderHook(() => useApproveStage("2"), {
      notifications,
    });

    await act(() => result.current.approve(stageRun));

    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Analyze approved",
      variant: "success",
    });
  });

  it("reports the server's message and rejects when approval fails", async () => {
    server.use(
      rest.post(approveUrl, (_req, res, ctx) =>
        res(ctx.status(409), ctx.json({ message: "Stage is not waiting" }))
      )
    );
    const notifications = createMockNotifications();
    const { result } = renderHook(() => useApproveStage("2"), {
      notifications,
    });

    await act(() =>
      expect(result.current.approve(stageRun)).rejects.toBeTruthy()
    );

    expect(notifications.pushNotification).toHaveBeenCalledTimes(1);
    expect(notifications.pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger" })
    );
  });
});
