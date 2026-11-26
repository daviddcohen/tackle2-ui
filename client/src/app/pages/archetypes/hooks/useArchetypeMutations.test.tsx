import { QueryClient } from "@tanstack/react-query";
import { rest } from "msw";

import { Archetype } from "@app/api/models";
import { agenticKeys } from "@app/queries/agentic";
import {
  ARCHETYPE_QUERY_KEY,
  useFetchArchetypeById,
} from "@app/queries/archetypes";
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

  it("succeeds after a create only once the archetype with the new profile is cached", async () => {
    const { saved, queryClient } = setUp();
    const payara = { id: 13, name: "Payara 6", generators: [] };
    // The archetype as the page reads it; its refetch waits until released.
    let release = () => {};
    const isReleased = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    server.use(
      rest.get("/hub/archetypes/1", async (_req, res, ctx) => {
        reads += 1;
        if (reads > 1) await isReleased;
        return res(
          ctx.json(
            reads > 1
              ? { ...archetype, profiles: [quarkus, liftAndShift, payara] }
              : archetype
          )
        );
      })
    );
    const { result } = renderHook(
      () => ({
        mutation: useTargetProfileMutation(),
        cached: useFetchArchetypeById(1, false),
      }),
      { queryClient }
    );
    await waitFor(() => expect(result.current.cached.archetype).toBeDefined());
    const onSuccess = jest.fn();

    act(() =>
      result.current.mutation.createTargetProfile(
        archetype,
        { name: "Payara 6", generators: [] },
        onSuccess
      )
    );

    await waitFor(() => expect(saved).toHaveBeenCalled());
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.mutation.isPending).toBe(true);

    release();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(result.current.mutation.isPending).toBe(false);
    expect(
      queryClient.getQueryData<Archetype>([ARCHETYPE_QUERY_KEY, "1"])?.profiles
    ).toContainEqual(payara);
  });
});

describe("useArchetypeMutations deleteTargetProfile", () => {
  it("names each deleted profile in its toast, also for two deletes at once", async () => {
    const saved = jest.fn();
    server.use(
      rest.put("/hub/archetypes/1", async (req, res, ctx) => {
        saved(await req.json());
        return res(ctx.status(204));
      })
    );
    const notifications = createMockNotifications();
    const { result } = renderHook(() => useArchetypeMutations(), {
      notifications,
    });

    act(() => {
      result.current.deleteTargetProfile(archetype, quarkus);
      result.current.deleteTargetProfile(archetype, liftAndShift);
    });

    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledTimes(2)
    );
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile Quarkus 3.x deleted",
      variant: "success",
    });
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile OpenShift lift and shift deleted",
      variant: "success",
    });
    // The second delete starts from the first one's result, so it does not
    // put the first profile back.
    expect(saved).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenNthCalledWith(1, {
      ...archetype,
      profiles: [liftAndShift],
    });
    expect(saved).toHaveBeenNthCalledWith(2, { ...archetype, profiles: [] });
  });

  it("does not send back a deleted profile that a stale read brought back", async () => {
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
    queryClient.setQueryData([ARCHETYPE_QUERY_KEY, "1"], archetype);
    const notifications = createMockNotifications();
    const { result } = renderHook(() => useArchetypeMutations(), {
      queryClient,
      notifications,
    });

    act(() => result.current.deleteTargetProfile(archetype, quarkus));
    await waitFor(() =>
      expect(notifications.pushNotification).toHaveBeenCalledWith({
        title: "Target profile Quarkus 3.x deleted",
        variant: "success",
      })
    );
    // A read that started before the delete lands after it.
    act(() => {
      queryClient.setQueryData([ARCHETYPE_QUERY_KEY, "1"], archetype);
    });
    act(() => result.current.deleteTargetProfile(archetype, liftAndShift));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    expect(saved).toHaveBeenNthCalledWith(2, { ...archetype, profiles: [] });
  });

  it("keeps a profile whose delete failed when a second delete follows at once", async () => {
    // The hub's archetype: the first PUT fails, later ones are saved.
    let hub = archetype;
    const saved = jest.fn();
    // The profiles the page shows while each PUT is on its way.
    const shownWhileSaving: number[][] = [];
    server.use(
      rest.get("/hub/archetypes/1", (_req, res, ctx) => res(ctx.json(hub))),
      rest.put("/hub/archetypes/1", async (req, res, ctx) => {
        const body = (await req.json()) as Archetype;
        saved(body);
        shownWhileSaving.push(
          (
            queryClient.getQueryData<Archetype>([ARCHETYPE_QUERY_KEY, "1"])
              ?.profiles ?? []
          ).map(({ id }) => id)
        );
        if (saved.mock.calls.length === 1) return res(ctx.status(500));
        hub = body;
        return res(ctx.status(204));
      })
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const notifications = createMockNotifications();
    const { result } = renderHook(
      () => ({
        mutations: useArchetypeMutations(),
        cached: useFetchArchetypeById(1, false),
      }),
      { queryClient, notifications }
    );
    await waitFor(() => expect(result.current.cached.archetype).toBeDefined());

    act(() => {
      result.current.mutations.deleteTargetProfile(archetype, quarkus);
      result.current.mutations.deleteTargetProfile(archetype, liftAndShift);
    });

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    expect(saved).toHaveBeenNthCalledWith(1, {
      ...archetype,
      profiles: [liftAndShift],
    });
    // Sent after the failure was reloaded: Quarkus 3.x stays.
    expect(saved).toHaveBeenNthCalledWith(2, {
      ...archetype,
      profiles: [quarkus],
    });
    // Each row leaves before the hub answers.
    expect(shownWhileSaving).toEqual([[12], [11]]);
    await waitFor(() =>
      expect(result.current.cached.archetype?.profiles).toEqual([quarkus])
    );
    expect(notifications.pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger" })
    );
    expect(notifications.pushNotification).toHaveBeenCalledWith({
      title: "Target profile OpenShift lift and shift deleted",
      variant: "success",
    });
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
