import type { EnvVar, ObjectMeta } from "@app/api/agentic/contract";
import {
  APPLICATION_LABEL,
  runHubCoordinates,
} from "@app/api/agentic/contract";

import { EntityId, EntityRef, HubRef } from "../types";

/**
 * Display names by entity id. Agentic CRDs reference each other by
 * `metadata.name` only, so a mapper that needs a ref's display name (a Skill's
 * `spec.displayName`, a Hub application name) takes one of these. Without it
 * the ref's name is the id.
 */
export type NameIndex = ReadonlyMap<EntityId, string>;

/** Hub application names by Hub application id. */
export type ApplicationNameIndex = ReadonlyMap<number, string>;

/** Builds a `NameIndex` from already-mapped domain entities. */
export const toNameIndex = (
  entities: readonly { id: EntityId; name: string }[]
): NameIndex => new Map(entities.map(({ id, name }) => [id, name]));

/** The domain id of a CRD object: its `metadata.name`. */
export const toEntityId = (metadata: ObjectMeta): EntityId =>
  metadata.name ?? "";

export const toEntityRef = (ref: string, names?: NameIndex): EntityRef => ({
  id: ref,
  name: names?.get(ref) ?? ref,
});

/**
 * The Hub application a run belongs to: the `konveyor.io/application` label,
 * else the `APP_ID` env the creating client sent.
 */
export const toRunApplication = (
  metadata: ObjectMeta,
  env: EnvVar[] | undefined,
  applicationNames?: ApplicationNameIndex
): HubRef | undefined => {
  const raw =
    metadata.labels?.[APPLICATION_LABEL] ?? runHubCoordinates(env).appId;
  const id = raw != null ? Number(raw) : NaN;
  if (!Number.isInteger(id)) return undefined;
  return { id, name: applicationNames?.get(id) ?? `#${id}` };
};

/**
 * Turns display text into a Kubernetes resource name (lowercase letters,
 * digits and hyphens, at most `maxLength` characters, starts and ends
 * alphanumeric). Returns `""` when nothing usable is left, so the caller must
 * validate. The CRDs have no display-name field except `SkillCard`, so this
 * name is what users see for every other entity.
 */
export const toResourceName = (text: string, maxLength = 63): string =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");

/**
 * The resource name a create writes for a display name: `toResourceName`,
 * checked. Throws when the display name has no usable character (for example
 * only punctuation), so a form can show the error instead of the Hub
 * answering 400/500.
 */
export const toNewResourceName = (displayName: string): EntityId => {
  const name = toResourceName(displayName);
  if (name === "") {
    throw new Error(
      `"${displayName}" has no letters or digits to build a resource name from.`
    );
  }
  return name;
};

/**
 * Thrown by `assertNotRenamed`: `metadata.name` is immutable and the Hub
 * copies only `spec` on PUT, so a rename would be silently ignored.
 */
export class RenameNotSupportedError extends Error {
  readonly id: EntityId;
  readonly requestedName: string;

  constructor(id: EntityId, requestedName: string) {
    super(
      `"${id}" cannot be renamed to "${requestedName}": the resource name is immutable.`
    );
    this.name = "RenameNotSupportedError";
    this.id = id;
    this.requestedName = requestedName;
  }
}

/**
 * Rename rule for every entity whose display name is its `metadata.name`
 * (Agent, Model/Gateway, Plan/AgentWorkflow, Skill collection; not Skill,
 * whose name is `spec.displayName`). The request name maps the same way as on
 * create (`toResourceName`), so an update is accepted when the request name
 * resolves to the current id ("Java EE to Quarkus" for `java-ee-to-quarkus`)
 * and throws `RenameNotSupportedError` otherwise. Call it before the PUT.
 */
export const assertNotRenamed = (id: EntityId, requestedName: string) => {
  if (requestedName !== id && toResourceName(requestedName) !== id) {
    throw new RenameNotSupportedError(id, requestedName);
  }
};
