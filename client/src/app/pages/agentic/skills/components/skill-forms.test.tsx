import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillCollection, SkillRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { ImportSkillModal, parseSkillName } from "./import-skill-modal";
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

describe("parseSkillName", () => {
  it("takes the first heading, else the file name", () => {
    expect(parseSkillName("a.md", "intro\n# My skill\n## Sub")).toBe(
      "My skill"
    );
    expect(parseSkillName("my-skill.md", "no heading")).toBe("my-skill");
  });
});

describe("ImportSkillModal", () => {
  let created: SkillRequest[];

  beforeEach(() => {
    created = [];
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),
      rest.post(AGENTIC_ENDPOINTS.skills, async (req, res, ctx) => {
        const body = await req.json();
        created.push(body);
        return res(ctx.status(201), ctx.json({ ...body, id: "9" }));
      })
    );
  });

  const upload = async (name: string, text: string) => {
    const user = userEvent.setup();
    const input = document.querySelector<HTMLInputElement>(
      "#import-skill-modal input[type=file]"
    );
    await user.upload(
      input!,
      new File([text], name, { type: "text/markdown" })
    );
    return user;
  };

  it("prefills an editable name and rejects a duplicate", async () => {
    render(<ImportSkillModal isOpen onClose={jest.fn()} />);
    const user = await upload("dup.md", "# Corporate coding standards\nBody");

    const name = await screen.findByDisplayValue("Corporate coding standards");
    expect(
      await screen.findByText("agentic.skill.validation.nameDuplicate")
    ).toBeInTheDocument();
    const importButton = screen.getByRole("button", {
      name: "agentic.skill.importConfirm",
    });
    expect(importButton).toBeDisabled();

    await user.clear(name);
    await user.type(name, "Corporate coding standards v2");
    await waitFor(() => expect(importButton).toBeEnabled());
  });

  it("creates the Skill without using the help text as its description", async () => {
    const onClose = jest.fn();
    render(<ImportSkillModal isOpen onClose={onClose} />);
    const user = await upload("new.md", "# Brand new skill\nBody");
    await screen.findByDisplayValue("Brand new skill");
    const importButton = screen.getByRole("button", {
      name: "agentic.skill.importConfirm",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(created).toEqual([
      {
        name: "Brand new skill",
        description: "",
        sourceType: "inline",
        content: "# Brand new skill\nBody",
      },
    ]);
  });
});

describe("SkillCollectionForm", () => {
  beforeEach(() => {
    server.use(
      rest.get(AGENTIC_ENDPOINTS.skills, (_req, res, ctx) =>
        res(ctx.json(skills))
      ),
      rest.get(AGENTIC_ENDPOINTS.skillCollections, (_req, res, ctx) =>
        res(ctx.json([collection]))
      )
    );
  });

  const nameInput = () => screen.getByRole("textbox", { name: /terms.name/ });
  const descriptionInput = () =>
    screen.getByRole("textbox", { name: /terms.description/ });

  it("rejects a duplicate name and an over-long name", async () => {
    const user = userEvent.setup();
    render(
      <SkillCollectionForm
        collection={null}
        initialSkillIds={["2"]}
        onClose={jest.fn()}
      />
    );
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
