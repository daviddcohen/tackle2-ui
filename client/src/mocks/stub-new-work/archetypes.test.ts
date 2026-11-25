import { Archetype } from "@app/api/models";
import {
  createArchetype,
  getArchetypeById,
  updateArchetype,
} from "@app/api/rest/archetypes";
import { server } from "@mocks/server";

import handlers, { mockArchetypes } from "./archetypes";

const fixtureProfileIds = Object.values(mockArchetypes).flatMap((archetype) =>
  (archetype.profiles ?? []).map((profile) => profile.id)
);

let saved: Record<number, Archetype>;

beforeEach(() => {
  server.use(...handlers);
  jest.spyOn(console, "log").mockImplementation(() => {});
  saved = JSON.parse(JSON.stringify(mockArchetypes));
});

afterEach(() => {
  Object.keys(mockArchetypes).forEach(
    (id) => delete mockArchetypes[Number(id)]
  );
  Object.assign(mockArchetypes, saved);
  jest.restoreAllMocks();
});

const newProfile = (name: string) => ({ id: 0, name, generators: [] });

describe("archetype stub target profile ids", () => {
  it("gives two profiles created in one update distinct new ids, keeping the existing ones", async () => {
    const archetype = await getArchetypeById(2);
    await updateArchetype({
      ...archetype,
      profiles: [
        ...(archetype.profiles ?? []),
        newProfile("First"),
        newProfile("Second"),
      ],
    });
    const profiles = (await getArchetypeById(2)).profiles ?? [];
    expect(profiles[0]).toEqual(archetype.profiles?.[0]);
    const [first, second] = profiles.slice(1).map((profile) => profile.id);
    expect(first).toBeGreaterThan(Math.max(...fixtureProfileIds));
    expect(second).toBeGreaterThan(first);
  });

  it("never reuses the id of a deleted profile", async () => {
    const archetype = await getArchetypeById(4);
    await updateArchetype({
      ...archetype,
      profiles: [...(archetype.profiles ?? []), newProfile("Temporary")],
    });
    const added = (await getArchetypeById(4)).profiles!.at(-1)!;
    // Delete it, then add another.
    await updateArchetype({ ...archetype, profiles: archetype.profiles });
    await updateArchetype({
      ...archetype,
      profiles: [...(archetype.profiles ?? []), newProfile("Replacement")],
    });
    const replacement = (await getArchetypeById(4)).profiles!.at(-1)!;
    expect(replacement.name).toBe("Replacement");
    expect(replacement.id).toBeGreaterThan(added.id);
  });

  it("gives the profiles of a created archetype new ids", async () => {
    const created = await createArchetype({
      name: "New archetype",
      description: "",
      comments: "",
      criteria: [],
      tags: [],
      stakeholders: [],
      stakeholderGroups: [],
      profiles: [newProfile("Only")],
    });
    const stored = mockArchetypes[created.id];
    expect(stored.profiles?.[0].id).toBeGreaterThan(
      Math.max(...fixtureProfileIds)
    );
    // The response is the archetype as stored, with the assigned ids.
    expect(created.profiles).toEqual(stored.profiles);
  });
});
