/**
 * The locked agents helper in English: it names each managed agent that uses
 * the collection, like the skill form names its locked collections.
 */
import { rest } from "msw";

import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { SkillCollectionForm } from "./skill-collection-form";

jest.mock("react-i18next", () =>
  jest.requireActual("@app/test-config/english-i18n")
);

const collection = {
  id: "1",
  name: "Security and compliance",
  description: "",
  skills: [{ id: "1", name: "Corporate coding standards" }],
};

const serveAgents = (agents: unknown[]) =>
  server.use(
    rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
      res(
        ctx.json([
          {
            id: "1",
            name: "Corporate coding standards",
            description: "",
            sourceType: "inline",
          },
        ])
      )
    ),
    rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
      res(ctx.json([collection]))
    ),
    rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
      res(ctx.json(agents))
    )
  );

const managed = (id: string, name: string, collectionIds: string[]) => ({
  id,
  name,
  skillCollections: collectionIds.map((cid) => ({ id: cid })),
  operatorManaged: true,
});

const agentsInput = () =>
  document.querySelector<HTMLInputElement>("#skill-collection-agents-input")!;

describe("SkillCollectionForm locked agents", () => {
  it("names the managed agent and why it stays", async () => {
    serveAgents([
      { id: "1", name: "Code Migrator", skillCollections: [{ id: "1" }] },
      managed("3", "Platform agent", ["1"]),
      managed("4", "Operator agent", []),
    ]);
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    expect(
      screen.getByText(
        "Platform agent is managed by Konveyor and cannot be removed here."
      )
    ).toBeInTheDocument();
  });

  it("names every managed agent in one sentence", async () => {
    serveAgents([
      managed("3", "Platform agent", ["1"]),
      managed("5", "Release agent", ["1"]),
    ]);
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    await waitFor(() => expect(agentsInput()).toBeEnabled());

    expect(
      screen.getByText(
        "Platform agent and Release agent are managed by Konveyor and cannot be removed here."
      )
    ).toBeInTheDocument();
  });
});
