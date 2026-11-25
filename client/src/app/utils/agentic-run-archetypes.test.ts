import type { Archetype } from "@app/api/models";

import { runArchetypes, runTouchesArchetype } from "./agentic";

const javaEe = {
  id: 1,
  name: "Java EE Application",
  applications: [
    { id: 1, name: "Customer Management" },
    { id: 7, name: "Partner Portal" },
  ],
};
const springBoot = {
  id: 2,
  name: "Spring Boot Application",
  applications: [{ id: 4, name: "Order Service" }],
};
// Hub leaves `applications` out of an archetype that has none.
const nodeJs: Pick<Archetype, "id" | "name" | "applications"> = {
  id: 5,
  name: "Node.js Service",
};

const runOn = (...ids: number[]) => ({
  applications: ids.map((id) => ({ id, name: `Application ${id}` })),
});

describe("runTouchesArchetype", () => {
  it("matches a run with any application in the archetype", () => {
    expect(runTouchesArchetype(runOn(7), javaEe)).toBe(true);
    expect(runTouchesArchetype(runOn(4, 1), javaEe)).toBe(true);
  });

  it("does not match a run without a member application", () => {
    expect(runTouchesArchetype(runOn(4), javaEe)).toBe(false);
    expect(runTouchesArchetype(runOn(), javaEe)).toBe(false);
  });

  it("does not match an archetype without applications", () => {
    expect(runTouchesArchetype(runOn(1), nodeJs)).toBe(false);
  });
});

describe("runArchetypes", () => {
  it("lists every archetype the run touches, by name", () => {
    expect(
      runArchetypes(runOn(4, 1), [springBoot, nodeJs, javaEe]).map(
        (archetype) => archetype.id
      )
    ).toEqual([1, 2]);
  });

  it("is empty when no archetype has the run's applications", () => {
    expect(runArchetypes(runOn(99), [javaEe, springBoot, nodeJs])).toEqual([]);
  });

  it("leaves the given list in its order", () => {
    const archetypes = [springBoot, javaEe];
    runArchetypes(runOn(1, 4), archetypes);
    expect(archetypes).toEqual([springBoot, javaEe]);
  });
});
