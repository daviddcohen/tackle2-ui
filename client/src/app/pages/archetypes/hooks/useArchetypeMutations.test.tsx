import { QueryClient } from "@tanstack/react-query";
import { rest } from "msw";

import { Archetype } from "@app/api/models";
import { agenticKeys } from "@app/queries/agentic";
import { ARCHETYPE_QUERY_KEY } from "@app/queries/archetypes";
import {
  act,
  createMockNotifications,
  renderHook,
  waitFor,
} from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import {
  useArchetypeMutations,
  useTargetProfileMutation,
} from "./useArchetypeMutations";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const quarkus = { id: 11, name: "Quarkus 3.x", generators: [] };
const liftAndShift = {
  id: 12,
  name: "OpenShift lift and shift",
  generators: [],
};
const archetype: Archetype = {
  id: 1,
  name: "Java EE Application",
  description: "",
  comments: "",
  tags: [],
  criteria: [],
  profiles: [quarkus, liftAndShift],
};

const setUp = () => {
  const saved = jest.fn();
  server.use(
    rest.put("/hub/archetypes/1", async (req, res, ctx) => {
      saved(await req.json());
      return res(ctx.status(204));
    })
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const notifications = createMockNotifications();
  const { result } = renderHook(() => useTargetProfileMutation(), {
    queryClient,
    notifications,
  });
  return { result, saved, queryClient, notifications };
};

describe("useTargetProfileMutation", () => {
  it("does not save a profile the archetype no longer has", async () => {
    const { result, saved, notifications } = setUp();
    const onSuccess = jest.fn();
    const onGone = jest.fn();

    act(() =>
      result.current.updateTargetProfile(
        { ...archetype, profiles: [quarkus] },
        liftAndShift,
        { name: "Renamed" },
        { onSuccess, onGone }
      )
    );

    expect(onGone).toHaveBeenCalled();
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile OpenShift lift and shift no longer exists",
      variant: "danger",
    });
    // Give a request the chance to go out.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(saved).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("caches the archetype as saved, so the next save starts from it", async () => {
    const { result, saved, queryClient } = setUp();
    const onSuccess = jest.fn();

    act(() =>
      result.current.updateTargetProfile(
        archetype,
        liftAndShift,
        { name: "Renamed" },
        { onSuccess, onGone: jest.fn() }
      )
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const expected = {
      ...archetype,
      profiles: [quarkus, { ...liftAndShift, name: "Renamed" }],
    };
    expect(saved).toHaveBeenCalledWith(expected);
    expect(queryClient.getQueryData([ARCHETYPE_QUERY_KEY, "1"])).toEqual(
      expected
    );
  });
});

describe("target profile writes refresh plans and migration views", () => {
  /** Cached plans and application migrations, to see what is invalidated. */
  const seeded = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(agenticKeys.list("plans"), []);
    queryClient.setQueryData(agenticKeys.list("applicationMigrations"), []);
    server.use(
      rest.put("/hub/archetypes/1", (_req, res, ctx) => res(ctx.status(204)))
    );
    return queryClient;
  };
  const isStale = (queryClient: QueryClient) =>
    (["plans", "applicationMigrations"] as const).every(
      (group) =>
        queryClient.getQueryState(agenticKeys.list(group))?.isInvalidated
    );

  it("after a delete", async () => {
    const queryClient = seeded();
    const { result } = renderHook(() => useArchetypeMutations(), {
      queryClient,
    });
    act(() => result.current.deleteTargetProfile(archetype, liftAndShift));
    await waitFor(() => expect(isStale(queryClient)).toBe(true));
  });

  it("after a create and a rename, not after another change", async () => {
    const queryClient = seeded();
    const { result } = renderHook(() => useTargetProfileMutation(), {
      queryClient,
    });
    const onSuccess = jest.fn();
    act(() =>
      result.current.updateTargetProfile(
        archetype,
        liftAndShift,
        { generators: [] },
        { onSuccess, onGone: jest.fn() }
      )
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(isStale(queryClient)).toBe(false);

    act(() =>
      result.current.updateTargetProfile(
        archetype,
        liftAndShift,
        { name: "Renamed" },
        { onSuccess, onGone: jest.fn() }
      )
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2));
    expect(isStale(queryClient)).toBe(true);

    const created = seeded();
    const { result: creating } = renderHook(() => useTargetProfileMutation(), {
      queryClient: created,
    });
    act(() =>
      creating.current.createTargetProfile(
        archetype,
        { name: "Payara 6", generators: [] },
        onSuccess
      )
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(3));
    expect(isStale(created)).toBe(true);
  });
});
