/**
 * Skill (domain) <-> SkillCard (konveyor.io/v1alpha1, `/hub/agentic/skills`),
 * and Skill collection <-> SkillCollection (`/hub/agentic/skillcollections`).
 */
import type * as Crd from "@app/api/agentic/contract";
import { isOperatorManaged } from "@app/utils/agentic";
import { skillSourceKind } from "@app/utils/skills";

import {
  Skill,
  SkillCollection,
  SkillCollectionRequest,
  SkillRequest,
  SkillSourceType,
} from "../types";

import { NameIndex, toEntityId, toEntityRef } from "./common";

const SOURCE_TYPES = {
  inline: "inline",
  source: "git",
  image: "oci",
} as const satisfies Record<string, SkillSourceType>;

/** `"/"`, `""` and surrounding slashes mean the repository root (no subPath). */
const toSubPath = (path: string | undefined) => {
  const trimmed = path?.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? trimmed : undefined;
};

/**
 * SkillCard -> Skill. `name` is `spec.displayName`, else `metadata.name`.
 * Pass `agents` to fill the `agent`-scope associations (the reverse of
 * `Agent.spec.skillCards`); without it `associations` is undefined. Archetype,
 * target-profile and application associations have no backend source. A card
 * with no source maps to `inline` with no content. An image card's `subPath`
 * has no domain field. `operatorManaged` marks the operator's built-in cards.
 */
export const toSkill = (
  card: Crd.SkillCard,
  agents?: readonly Crd.AgentResource[]
): Skill => {
  const id = toEntityId(card.metadata);
  const { spec } = card;
  const kind = skillSourceKind(spec);
  return {
    id,
    name: spec.displayName || id,
    description: spec.description ?? "",
    sourceType: kind != null ? SOURCE_TYPES[kind] : "inline",
    content: kind === "inline" ? spec.inline : undefined,
    repoUrl: kind === "source" ? spec.source : undefined,
    repoBranch: kind === "source" ? spec.ref : undefined,
    repoPath: kind === "source" ? spec.subPath : undefined,
    imageRef: kind === "image" ? spec.image : undefined,
    associations: agents
      ?.filter((agent) =>
        (agent.spec.skillCards ?? []).some(({ ref }) => ref === id)
      )
      .map((agent) => ({
        scope: "agent" as const,
        resource: toEntityRef(toEntityId(agent.metadata)),
      })),
    operatorManaged: isOperatorManaged(card),
    createTime: card.metadata.creationTimestamp,
    updateTime: undefined,
  };
};

/** The source fields of a SkillCard spec: exactly one source is written. */
const NO_SOURCE: Crd.SkillCardSpec = {
  inline: undefined,
  source: undefined,
  ref: undefined,
  subPath: undefined,
  image: undefined,
};

/**
 * SkillRequest -> SkillCard spec, spread over `base` and setting exactly one
 * source. On update pass the current `card.spec` as `base`: the Hub replaces
 * the whole spec, so `type`, `tags`, `version`, an image card's `subPath` and
 * any field this contract does not know yet are kept from it. `name` is
 * `spec.displayName`, so a Skill can be renamed (its resource name cannot).
 * `associations` are not written here: the `agent` scope lives on
 * `Agent.spec.skillCards`, the Hub scopes have no backend yet.
 */
export const toSkillCardSpec = (
  request: SkillRequest,
  base: Crd.SkillCardSpec = {}
): Crd.SkillCardSpec => {
  const common: Crd.SkillCardSpec = {
    ...base,
    ...NO_SOURCE,
    displayName: request.name,
    description: request.description || undefined,
  };
  switch (request.sourceType) {
    case "git":
      return {
        ...common,
        source: request.repoUrl,
        ref: request.repoBranch || undefined,
        subPath: toSubPath(request.repoPath),
      };
    case "oci":
      return {
        ...common,
        image: request.imageRef,
        subPath: base.image != null ? base.subPath : undefined,
      };
    default:
      return { ...common, inline: request.content ?? "" };
  }
};

/**
 * SkillCollection -> Skill collection. Members are the `skillCardRef` entries
 * plus `status.resolvedSkills` (the cards the collection owns: enumerated from
 * `spec.image` or created from `image`/`source` entries), without duplicates.
 * `skillNames` resolves display names. `description` has no backend source
 * and is "".
 */
export const toSkillCollection = (
  collection: Crd.SkillCollection,
  skillNames?: NameIndex
): SkillCollection => {
  const refs = (collection.spec.skills ?? []).flatMap(({ skillCardRef }) =>
    skillCardRef != null ? [skillCardRef] : []
  );
  const members = [
    ...new Set([...refs, ...(collection.status?.resolvedSkills ?? [])]),
  ];
  return {
    id: toEntityId(collection.metadata),
    name: toEntityId(collection.metadata),
    description: "",
    skills: members.map((ref) => toEntityRef(ref, skillNames)),
    operatorManaged: isOperatorManaged(collection),
  };
};

/**
 * Members the controller owns: cards in `status.resolvedSkills` that no
 * `skillCardRef` entry names (created from `image`/`source` entries).
 * `toSkillCollection` lists them, so an edit form sends them back; pass them
 * to `toSkillCollectionSpec` so they are not written as `skillCardRef`
 * duplicates.
 */
export const controllerOwnedSkills = (
  collection: Crd.SkillCollection
): string[] => {
  const refs = new Set(
    (collection.spec.skills ?? []).flatMap(({ skillCardRef }) =>
      skillCardRef != null ? [skillCardRef] : []
    )
  );
  return (collection.status?.resolvedSkills ?? []).filter(
    (name) => !refs.has(name)
  );
};

/** `name` if no entry uses it yet, else `name-2`, `name-3`, ... */
const unusedEntryName = (name: string, taken: Set<string>) => {
  let candidate = name;
  for (let suffix = 2; taken.has(candidate); suffix++) {
    candidate = `${name}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
};

/**
 * SkillCollectionRequest -> SkillCollection spec, spread over `base`.
 * - Entries of `base` keep their position and every field, including their
 *   `name` (the list-map key, which may differ from the card name): an
 *   `image`/`source` entry (not visible in the domain) is always kept, a
 *   `skillCardRef` entry is kept while the request still lists its card.
 * - Each requested Skill with no entry yet is appended as
 *   `{ name, skillCardRef }`, named after the card (made unique among the
 *   entry names), except `controllerOwned` members (see
 *   `controllerOwnedSkills`), which an `image`/`source` entry already
 *   provides.
 *
 * Throws for a collection that enumerates `spec.image`: its members are
 * controller-owned. The CRD requires at least one entry; `name` (the resource
 * name, immutable: see `assertNotRenamed`) and `description` have no spec
 * field (the form treats the description as optional).
 */
export const toSkillCollectionSpec = (
  request: SkillCollectionRequest,
  base: Crd.SkillCollectionSpec = {},
  controllerOwned: readonly string[] = []
): Crd.SkillCollectionSpec => {
  if (base.image != null) {
    throw new Error(
      "The members of a collection that enumerates an image cannot be edited."
    );
  }
  const requested = new Set(
    request.skills
      .map(({ id }) => id)
      .filter((id) => !controllerOwned.includes(id))
  );
  const kept = (base.skills ?? []).filter(
    ({ skillCardRef }) => skillCardRef == null || requested.has(skillCardRef)
  );
  const present = new Set(kept.map(({ skillCardRef }) => skillCardRef));
  const taken = new Set(kept.map(({ name }) => name));
  const added = [...requested]
    .filter((id) => !present.has(id))
    .map((id) => ({ name: unusedEntryName(id, taken), skillCardRef: id }));
  return { ...base, skills: [...kept, ...added] };
};
