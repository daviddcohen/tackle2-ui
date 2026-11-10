describe("Agentic product direction", () => {
  it("shows curated and expert Plan execution choices", () => {
    cy.visit("/applications");
    cy.contains("Application inventory").should("be.visible");
    cy.get("tbody input[type='checkbox']").first().check({ force: true });
    cy.get("#start-agentic-migration").should("be.enabled").click();

    cy.contains("h1", "Start Migration").should("be.visible");
    cy.contains("Use the recommended Plan for each application").should(
      "be.visible"
    );
    cy.contains("Apply one Plan to all selected applications").should(
      "be.visible"
    );
    cy.get("#migration-target-branch").should(
      "have.value",
      "mta/agentic-migration"
    );
    cy.contains(
      "The same branch name will be created in each selected application's separate repository."
    ).should("be.visible");

    cy.get("#plan-selection-single").check({ force: true });
    cy.contains("Expert Plan override").should("be.visible");
    cy.get("input[placeholder='Select a Plan...']").should("be.visible");
  });

  it("shows Platform Engineer Models, Tools, and execution policy", () => {
    cy.visit(
      "/models?protoPersona=platformEngineer&protoPortfolio=12&protoScenario=configured"
    );
    cy.contains("h1", "Models").should("be.visible");
    cy.contains("Execution policy").should("be.visible");
    cy.contains("Approved Tools").scrollIntoView().should("be.visible");
    cy.contains("Unattended").should("be.visible");
    cy.contains("Git repository").scrollIntoView().should("be.visible");
  });

  it("keeps Skill Collections on a separate inventory", () => {
    cy.visit("/skill-collections");
    cy.contains("h1", "Skill Collections").should("be.visible");
    cy.contains("Java modernization foundation").should("be.visible");
    cy.contains("Create Skill Collection").should("be.visible");
  });

  it("offers standalone Agent testing to an Enterprise Architect", () => {
    cy.visit(
      "/agents?protoPersona=enterpriseArchitect&protoPortfolio=12&protoScenario=configured"
    );
    cy.contains("h1", "Agents").should("be.visible");
    cy.get("tbody").first().find("button").last().click();
    cy.contains("Test Agent").click();
    cy.contains("Advanced Agent experimentation").should("be.visible");
    cy.contains("Task instructions").should("be.visible");
  });

  it("shows effective Skills and Git results for a completed execution", () => {
    cy.visit(
      "/applications?protoPersona=enterpriseArchitect&protoPortfolio=12&protoScenario=completed"
    );
    cy.contains("Advisor Workbench API").click();
    cy.contains('[role="tab"]', "Migration").click();
    cy.contains("Effective Skills").scrollIntoView().should("be.visible");
    cy.contains("Git results").scrollIntoView().should("be.visible");
    cy.contains("mta/agentic-migration").should("be.visible");
    cy.contains("Created by the").should("be.visible");
  });

  it("keeps the Plan launch form usable at a narrow viewport", () => {
    cy.viewport(1024, 768);
    cy.visit("/applications");
    cy.get("tbody input[type='checkbox']").first().check({ force: true });
    cy.get("#start-agentic-migration").click();
    cy.get("#plan-selection-recommended")
      .scrollIntoView()
      .focus()
      .should("have.focus");
    cy.get("#migration-target-branch")
      .scrollIntoView()
      .should("be.visible")
      .and("have.attr", "required");
  });
});
