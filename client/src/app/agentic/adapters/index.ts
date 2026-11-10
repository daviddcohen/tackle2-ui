/**
 * Pure mappers between the agentic backend contract
 * (`@app/api/agentic/contract`, konveyor.io/v1alpha1 CRDs served by the Hub
 * under `/hub/agentic/*`) and the UI domain types (`@app/agentic`).
 *
 * Not wired into the app: the prototype mocks are still the active transport.
 * See docs/agentic-handoff.md for the endpoint inventory, the field mapping
 * tables and the wiring checklist.
 */
export * from "./agents";
export * from "./common";
export * from "./models";
export * from "./plan-runs";
export * from "./plans";
export * from "./skills";
