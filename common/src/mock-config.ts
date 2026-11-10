/**
 * Returns true when the `MOCK` setting turns on the client's stub handler
 * group `name` (see client/src/mocks/config.ts for the full MOCK syntax).
 *
 * `MOCK=stub` and `MOCK=stub=*` turn on every group; `MOCK=stub=a,b` turns
 * on only the listed groups. Any `.pass` / `.full` suffix is ignored here.
 *
 * Shared so the server, the dev server and the client agree on deployment
 * defaults that depend on the mocks (e.g. `AGENTIC_ENABLED`).
 */
export const isMockStubEnabled = (
  mock: string | undefined,
  name: string
): boolean =>
  (mock ?? "")
    .toLowerCase()
    .split(".")
    .some((part) => {
      const match = part.trim().match(/^stub(?:=(.*))?$/);
      if (!match) {
        return false;
      }
      const groups = match[1];
      return (
        groups == null ||
        groups === "" ||
        groups === "*" ||
        groups
          .split(",")
          .map((group) => group.trim())
          .includes(name)
      );
    });
