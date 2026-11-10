import { type RestHandler, rest } from "msw";

import type { SourcePlatform } from "@app/api/models";
import { hub } from "@app/api/rest";

/**
 * Simple stub handlers as place holders until hub API is ready.
 *
 * Handler structure modeled after hub api handler:
 *   https://github.com/konveyor/tackle2-hub/blob/main/api/platform.go
 *
 * No platforms are defined: a platform `kind` also needs its coordinates
 * schema (`/schemas/...`), which is not stubbed.
 */
const handlers: RestHandler[] = [
  rest.get(hub`/platforms`, (_req, res, ctx) => res(ctx.json(mockPlatforms))),

  rest.get(hub`/platforms/:id`, (_req, res, ctx) =>
    res(ctx.status(404), ctx.json({ error: "Platform not found" }))
  ),
];

export const mockPlatforms: SourcePlatform[] = [];

export default handlers;
