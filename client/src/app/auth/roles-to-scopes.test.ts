import {
  adminScopes,
  adminViewScopes,
  architectScopes,
  migrationViewScopes,
  migratorScopes,
} from "./roles-to-scopes";

const hasSomeScope = (available: string[], required: string[]) =>
  required.some((scope) => available.includes(scope));

describe("Konveyor perspective and agentic scope mapping", () => {
  it("allows administrators to use Administration and Migration", () => {
    expect(hasSomeScope(adminScopes, adminViewScopes)).toBe(true);
    expect(hasSomeScope(adminScopes, migrationViewScopes)).toBe(true);
  });

  it("limits architects to the Migration perspective", () => {
    expect(hasSomeScope(architectScopes, adminViewScopes)).toBe(false);
    expect(hasSomeScope(architectScopes, migrationViewScopes)).toBe(true);
  });

  it("matches the current Hub Agent and Plan authorization boundary", () => {
    expect(architectScopes).toContain("agentic.agents:get");
    expect(architectScopes).toContain("agentic.agents:post");
    expect(architectScopes).toContain("agentic.workflows:post");
  });

  it("allows migrators to execute but not configure agentic resources", () => {
    expect(migratorScopes).toContain("agentic.workflowruns:post");
    expect(migratorScopes).not.toContain("agentic.agentruns:post");
    expect(migratorScopes).toContain("agentic.workflows:get");
    expect(migratorScopes).not.toContain("agentic.workflows:post");
    expect(migratorScopes).not.toContain("agentic.skills:post");
  });
});
