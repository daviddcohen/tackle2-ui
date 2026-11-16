import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import { Skill, SkillRequest } from "@app/agentic";
import { AGENTIC_ENDPOINTS } from "@app/api/rest/agentic";
import { render, screen, waitFor } from "@app/test-config/test-utils";
import { server } from "@mocks/server";

import { ImportSkillModal, parseSkillName } from "./import-skill-modal";

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
