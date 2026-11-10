import { getPrototypeMasqueradePreset } from "./prototype-auth";

describe("prototype persona scope mapping", () => {
  it("maps product personas to current Konveyor role presets", () => {
    expect(getPrototypeMasqueradePreset("platformEngineer")).toBe("admin");
    expect(getPrototypeMasqueradePreset("enterpriseArchitect")).toBe(
      "architect"
    );
    expect(getPrototypeMasqueradePreset("hubMigrator")).toBe("migrator");
  });

  it("does not let a data scenario change authorization", () => {
    expect(getPrototypeMasqueradePreset("enterpriseArchitect")).toBe(
      "architect"
    );
  });
});
