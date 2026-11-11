import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillCollection } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { SkillCollectionForm } from "./skill-collection-form";

const skills: Skill[] = [
  {
    id: "1",
    name: "Corporate coding standards",
    description: "",
    sourceType: "inline",
    content: "# Corporate coding standards",
  },
  { id: "2", name: "Quarkus", description: "", sourceType: "inline" },
];

const collection: SkillCollection = {
  id: "1",
  name: "Security and compliance",
  description: "Security skills.",
  skills: [{ id: "1", name: "Corporate coding standards" }],
};

describe("SkillCollectionForm", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json([collection]))
      ),
      rest.get(AGENTIC_ENDPOINTS.agents, (_req, res, ctx) =>
        res(
          ctx.json([
            { id: "1", name: "Code Migrator", skillCollections: [{ id: "1" }] },
          ])
        )
      )
    );
  });

  const nameInput = () => screen.getByRole("textbox", { name: /terms.name/ });
  const descriptionInput = () =>
    screen.getByRole("textbox", { name: /terms.description/ });

  it("rejects a duplicate name and an over-long name", async () => {
    const user = userEvent.setup();
    render(<SkillCollectionForm collection={null} onClose={jest.fn()} />);
    // A valid skill selection, so only the name keeps Create disabled.
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Quarkus"));
    await user.keyboard("{Escape}");
    await user.type(nameInput(), "security AND compliance");
    await user.type(descriptionInput(), "dup");
    // duplicateNameCheck is case-sensitive (upstream behaviour): exact match only
    await user.clear(nameInput());
    await user.type(nameInput(), "Security and compliance");
    expect(
      await screen.findByText(
        "agentic.skillCollection.validation.nameDuplicate"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "actions.create" })
    ).toBeDisabled();

    await user.clear(nameInput());
    await user.type(nameInput(), "x".repeat(121));
    expect(
      await screen.findByText("agentic.skillCollection.validation.nameMaximum")
    ).toBeInTheDocument();
  });

  it("warns on edit how many agents use the collection (S3)", async () => {
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    expect(
      await screen.findByText("agentic.skillCollection.editWarning")
    ).toBeInTheDocument();
  });

  it("has no warning when creating", async () => {
    render(<SkillCollectionForm collection={null} onClose={jest.fn()} />);
    await screen.findByRole("button", { name: "actions.create" });
    await waitFor(() =>
      expect(
        screen.queryByText("agentic.skillCollection.editWarning")
      ).not.toBeInTheDocument()
    );
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    render(<SkillCollectionForm collection={collection} onClose={jest.fn()} />);
    const save = screen.getByRole("button", { name: "actions.save" });
    // valid but untouched
    await waitFor(() => expect(save).toBeDisabled());
    await user.type(descriptionInput(), " More.");
    await waitFor(() => expect(save).toBeEnabled());
  });
});
