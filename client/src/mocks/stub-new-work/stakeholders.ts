import { type RestHandler, rest } from "msw";

import type { Stakeholder } from "@app/api/models";
import { hub } from "@app/api/rest";

/**
 * Simple stub handlers as place holders until hub API is ready.
 *
 * Handler structure modeled after hub api handler:
 *   https://github.com/konveyor/tackle2-hub/blob/main/api/stakeholder.go
 */
const handlers: RestHandler[] = [
  rest.get(hub`/stakeholders`, (_req, res, ctx) =>
    res(ctx.json(mockStakeholders))
  ),

  rest.get(hub`/stakeholders/:id`, (req, res, ctx) => {
    const id = Number(req.params.id);
    const stakeholder = mockStakeholders.find((item) => item.id === id);
    return stakeholder != null
      ? res(ctx.json(stakeholder))
      : res(ctx.status(404), ctx.json({ error: "Stakeholder not found" }));
  }),
];

export const mockStakeholders: Stakeholder[] = [
  {
    id: 1,
    name: "Alex Rivera",
    email: "alex.rivera@example.com",
    jobFunction: { id: 1, name: "Business Analyst" },
    stakeholderGroups: [],
  },
  {
    id: 2,
    name: "Priya Shah",
    email: "priya.shah@example.com",
    jobFunction: { id: 2, name: "Developer" },
    stakeholderGroups: [],
  },
  {
    id: 3,
    name: "Morgan Lee",
    email: "morgan.lee@example.com",
    jobFunction: { id: 3, name: "Architect" },
    stakeholderGroups: [],
  },
];

export default handlers;
