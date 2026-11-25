/**
 * The one skill resolver of the agentic mock server, keyed by stage. The plan
 * preview (`POST /plans/skills/resolve`), the application migration view, run
 * creation (and the seeded runs), the skill page plans list and the plan
 * check all read it, so they cannot disagree.
 *
 * Rules (docs/agentic-handoff.md, "Skill resolution"):
 * - A stage gets its agent's own skills and the skills of the collections
 *   that agent uses. Only that stage: nothing is pooled across stages.
 * - Every stage also gets the context skills, listed once in an `everyStage`
 *   group: for an application, the skills attached to each of its archetypes,
 *   to the target profile the run picks for it (without a pick, its default
 *   path's: the only one whose profile uses a plan, else none; none when the
 *   pick is null) and to the application itself; for a plan preview
 *   without applications, the preview's target profiles (a saved plan's: the
 *   profiles that use it) and the archetypes that own them.
 * - A plan exclusion applies to every origin except the application itself:
 *   a skill attached to the application is never excluded. A run exclusion
 *   applies to every origin. Excluded skills stay listed with
 *   `excluded: true`.
 * - Origins are deduplicated and ordered agent, collection, archetype, target
 *   profile, application; skills follow their first origin. Unknown agents,
 *   collections, archetypes, target profiles, applications and skills add
 *   nothing.
 * - A run on several applications gets one `everyStage` group per
 *   application, so one application's context never reaches another.
 */
import {
  EntityId,
  HubRef,
  SkillLoadPolicy,
  SkillOrigin,
  SkillPlacement,
  SkillsByStage,
  StageSkill,
  StageSkillsGroup,
} from "@app/agentic";
import { Application } from "@app/api/models";

import {
  StoredPlan,
  StoredSkill,
  badRequest,
  db,
  findApplication,
  findArchetype,
  findTargetProfile,
  hubIdOf,
  isSeeded,
  migrationPathsOfPlan,
  resolveAgentRef,
  resolveCollectionRef,
  resolveSkillRef,
} from "./db";
import { getPrototypeScenario } from "./prototype-state";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** One stage to resolve: ids only, so a draft works too. */
export interface StageInput {
  agentId: EntityId;
  /** The stored stage's agent name, shown if the agent no longer exists. */
  agentName?: string;
  name: string;
  /** Set for run snapshots: the stage id the stage run carries. */
  stageId?: EntityId;
}

/**
 * Where the context skills come from: target profiles and the archetypes
 * that own them (a plan preview) or the applications of a run or of the
 * application view.
 */
export type ResolutionContext =
  | { kind: "plan"; targetProfileIds: number[] }
  | {
      kind: "applications";
      applicationIds: number[];
      /**
       * The target profile a run picks per application id (null: none). An
       * application left out gets its default path's (`defaultPathOf`), or
       * none without one. Runs always pass a pick for every application.
       */
      targetProfileIds?: ReadonlyMap<number, number | null>;
    };

export interface ResolutionInput {
  stages: StageInput[];
  context: ResolutionContext;
  /** The plan's exclusions: never a skill attached to the application. */
  excludedSkillIds?: ReadonlySet<EntityId>;
  /** A run's own exclusions: every origin, the application's included. */
  runExcludedSkillIds?: ReadonlySet<EntityId>;
}

/** A saved (or fixture) plan as resolver stages, in stage order. */
export const stagesOfPlan = (plan: {
  stages: {
    id: EntityId;
    name: string;
    agent: { id: EntityId; name?: string };
    order: number;
  }[];
}): StageInput[] =>
  [...plan.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      agentId: stage.agent.id,
      agentName: stage.agent.name,
      name: stage.name,
      stageId: stage.id,
    }));

/**
 * The plan preview context of a saved plan: the target profiles that use it
 * (its `migrationPaths`) and their archetypes.
 */
export const planContextOf = (planId: EntityId): ResolutionContext => ({
  kind: "plan",
  targetProfileIds: migrationPathsOfPlan(planId).map(
    ({ targetProfile }) => targetProfile.id
  ),
});

/** Ids of the Skills a Plan turns off. */
export const excludedSkillIdsOf = (plan: {
  excludedSkills?: { id: EntityId }[];
}): Set<EntityId> => new Set((plan.excludedSkills ?? []).map((ref) => ref.id));

// ---------------------------------------------------------------------------
// Applications: their archetypes and migration paths
// ---------------------------------------------------------------------------

/**
 * The Plan a target profile uses (its stored reference), hidden in the
 * `initial` scenario like every seeded Plan.
 */
export const assignedPlanFor = (
  targetProfileId: number
): StoredPlan | undefined => {
  const planId = db.targetProfilePlans[targetProfileId];
  if (planId == null) return undefined;
  if (getPrototypeScenario() === "initial" && isSeeded("plans", planId)) {
    return undefined;
  }
  return db.plans.find((plan) => plan.id === planId);
};

/**
 * Every target profile an application can migrate on: the profiles of each
 * of its archetypes, in archetype order, then profile order.
 */
export const targetProfilesOf = (application: Application) =>
  (application.archetypes ?? []).flatMap((ref) =>
    (findArchetype(ref.id)?.profiles ?? []).map((profile) => ({
      archetypeId: ref.id,
      profile,
    }))
  );

/**
 * An application's migration paths (`targetProfilesOf`), each with the Plan
 * its target profile uses, if any.
 */
export const migrationPathsOf = (application: Application) =>
  targetProfilesOf(application).map((path) => ({
    ...path,
    plan: assignedPlanFor(path.profile.id),
  }));

/**
 * The application's default path: its only path whose target profile uses a
 * Plan. Undefined when none does, or several do (then a run needs a pick).
 * Never "the first profile": the order of profiles means nothing.
 */
export const defaultPathOf = (application: Application) => {
  const runnable = migrationPathsOf(application).filter(
    (path) => path.plan != null
  );
  return runnable.length === 1 ? runnable[0] : undefined;
};

/** The application's paths whose target profile uses the Plan. */
export const pathsUsingPlan = (application: Application, planId: EntityId) =>
  migrationPathsOf(application).filter((path) => path.plan?.id === planId);

/**
 * Reads a run's target profile pick for an application (`{ id }` or null;
 * undefined when absent). 400 when the profile is not one of the
 * application's (`targetProfilesOf`).
 */
export const targetProfilePickOf = (
  value: unknown,
  application: Application,
  field: string
): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const profileId = hubIdOf(value, field);
  if (
    !targetProfilesOf(application).some(
      ({ profile }) => profile.id === profileId
    )
  ) {
    throw badRequest(
      `${field}: target profile "${profileId}" does not belong to an archetype of ${application.name}.`
    );
  }
  return profileId;
};

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

const ORIGIN_RANK: Record<SkillOrigin["kind"], number> = {
  agent: 0,
  collection: 1,
  archetype: 2,
  targetProfile: 3,
  application: 4,
};

const originKey = (origin: SkillOrigin): string => {
  switch (origin.kind) {
    case "agent":
      return `agent:${origin.agent.id}`;
    case "collection":
      return `collection:${origin.agent.id}:${origin.collection.id}`;
    case "archetype":
      return `archetype:${origin.archetype.id}`;
    case "targetProfile":
      return `targetProfile:${origin.targetProfile.id}`;
    case "application":
      return `application:${origin.application.id}`;
  }
};

/** A Skill reaching a group through one origin. */
interface Reach {
  skill: StoredSkill;
  origin: SkillOrigin;
}

const findSkill = (id: EntityId) =>
  db.skills.find((candidate) => candidate.id === id);

const loadPolicyOf = (skill: { loadPolicy?: SkillLoadPolicy }) =>
  skill.loadPolicy ?? "skill";

/**
 * Merges reaches into one entry per Skill, origins deduplicated and ordered
 * by kind (stable), Skills in the order of their first origin.
 */
const toStageSkills = (
  reaches: Reach[],
  excludedSkillIds: ReadonlySet<EntityId>,
  runExcludedSkillIds: ReadonlySet<EntityId>
): StageSkill[] => {
  const sorted = reaches
    .map((reach, index) => ({ reach, index }))
    .sort(
      (a, b) =>
        ORIGIN_RANK[a.reach.origin.kind] - ORIGIN_RANK[b.reach.origin.kind] ||
        a.index - b.index
    )
    .map(({ reach }) => reach);
  const result: StageSkill[] = [];
  sorted.forEach(({ skill, origin }) => {
    let entry = result.find((candidate) => candidate.skill.id === skill.id);
    if (!entry) {
      entry = {
        skill: { id: skill.id, name: skill.name },
        loadPolicy: loadPolicyOf(skill),
        from: [],
        excluded: false,
      };
      result.push(entry);
    }
    if (!entry.from.some((other) => originKey(other) === originKey(origin))) {
      entry.from.push(origin);
    }
  });
  result.forEach((entry) => {
    entry.excluded =
      runExcludedSkillIds.has(entry.skill.id) ||
      (excludedSkillIds.has(entry.skill.id) &&
        !entry.from.some((origin) => origin.kind === "application"));
  });
  return result;
};

/** The stage agent's own skills and its collections' skills. */
const agentReaches = (agentId: EntityId): Reach[] => {
  const agent = db.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return [];
  const agentRef = { id: agent.id, name: agent.name };
  const own = agent.skills.flatMap((ref): Reach[] => {
    const skill = findSkill(ref.id);
    return skill ? [{ skill, origin: { kind: "agent", agent: agentRef } }] : [];
  });
  const collected = (agent.skillCollections ?? []).flatMap((ref) => {
    const collection = db.skillCollections.find(
      (candidate) => candidate.id === ref.id
    );
    if (!collection) return [];
    const collectionRef = { id: collection.id, name: collection.name };
    return collection.skills.flatMap((member): Reach[] => {
      const skill = findSkill(member.id);
      return skill
        ? [
            {
              skill,
              origin: {
                kind: "collection",
                agent: agentRef,
                collection: collectionRef,
              },
            },
          ]
        : [];
    });
  });
  return [...own, ...collected];
};

/** Skills attached to one Hub entity, in skill order. */
const attachedTo = (
  scope: "archetype" | "targetProfile" | "application",
  id: number
): StoredSkill[] =>
  db.skills.filter((skill) =>
    skill.associations.some(
      (association) =>
        association.scope === scope && association.resource.id === id
    )
  );

const archetypeReaches = (archetypeId: number): Reach[] => {
  const archetype = findArchetype(archetypeId);
  if (!archetype) return [];
  const ref: HubRef = { id: archetype.id, name: archetype.name };
  return attachedTo("archetype", archetype.id).map((skill) => ({
    skill,
    origin: { kind: "archetype", archetype: ref },
  }));
};

const targetProfileReaches = (targetProfileId: number): Reach[] => {
  const found = findTargetProfile(targetProfileId);
  if (!found) return [];
  const targetProfile: HubRef = {
    id: found.profile.id,
    name: found.profile.name,
  };
  const archetype: HubRef = {
    id: found.archetype.id,
    name: found.archetype.name,
  };
  return attachedTo("targetProfile", targetProfileId).map((skill) => ({
    skill,
    origin: { kind: "targetProfile", targetProfile, archetype },
  }));
};

/**
 * Context reaches of one application: its archetypes, the target profile the
 * run picks (`undefined`: its default path's, none without one; null: none)
 * and itself.
 */
const applicationReaches = (
  application: Application,
  targetProfileId: number | null | undefined
): Reach[] => {
  const profileId =
    targetProfileId !== undefined
      ? targetProfileId
      : defaultPathOf(application)?.profile.id;
  const ref: HubRef = { id: application.id, name: application.name };
  return [
    ...(application.archetypes ?? []).flatMap((archetype) =>
      archetypeReaches(archetype.id)
    ),
    ...(profileId != null ? targetProfileReaches(profileId) : []),
    ...attachedTo("application", application.id).map(
      (skill): Reach => ({
        skill,
        origin: { kind: "application", application: ref },
      })
    ),
  ];
};

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/** What each stage gets, and the context skills every stage gets. */
export const resolveSkillsByStage = ({
  stages,
  context,
  excludedSkillIds = new Set(),
  runExcludedSkillIds = new Set(),
}: ResolutionInput): SkillsByStage => {
  const skillsOf = (reaches: Reach[]) =>
    toStageSkills(reaches, excludedSkillIds, runExcludedSkillIds);
  const stageGroups = stages.map(
    (stage, index): StageSkillsGroup => ({
      order: index + 1,
      name: stage.name,
      agent: resolveAgentRef({
        id: stage.agentId,
        name: stage.agentName || stage.agentId,
      }),
      ...(stage.stageId != null ? { stageId: stage.stageId } : {}),
      skills: skillsOf(agentReaches(stage.agentId)),
    })
  );
  if (context.kind === "plan") {
    // Each target profile and the archetype that owns it, deduplicated.
    const archetypeIds = new Set(
      context.targetProfileIds.flatMap((id) => {
        const found = findTargetProfile(id);
        return found != null ? [found.archetype.id] : [];
      })
    );
    const reaches = [
      ...[...archetypeIds].flatMap(archetypeReaches),
      ...context.targetProfileIds.flatMap(targetProfileReaches),
    ];
    return {
      stages: stageGroups,
      everyStage: [{ skills: skillsOf(reaches) }],
    };
  }
  const applicationIds = [...new Set(context.applicationIds)];
  return {
    stages: stageGroups,
    everyStage: applicationIds.flatMap((applicationId) => {
      const application = findApplication(applicationId);
      if (!application) return [];
      return [
        {
          application: { id: application.id, name: application.name },
          skills: skillsOf(
            applicationReaches(
              application,
              context.targetProfileIds?.get(application.id)
            )
          ),
        },
      ];
    }),
  };
};

/** Every StageSkill of a resolution, stage groups first, then every stage. */
const allStageSkills = (resolution: SkillsByStage): StageSkill[] => [
  ...resolution.stages.flatMap((group) => group.skills),
  ...resolution.everyStage.flatMap((group) => group.skills),
];

/** Skill ids a resolution lists at all (excluded ones included). */
export const resolvedSkillIds = (resolution: SkillsByStage): Set<EntityId> =>
  new Set(allStageSkills(resolution).map(({ skill }) => skill.id));

/**
 * Where one Skill sits in a resolution: one placement per stage group that
 * lists it, plus one without `stage` for the every-stage group(s).
 */
export const placementsOf = (
  resolution: SkillsByStage,
  skillId: EntityId
): SkillPlacement[] => {
  const placements: SkillPlacement[] = resolution.stages.flatMap((group) =>
    group.skills
      .filter(({ skill }) => skill.id === skillId)
      .map(({ from, excluded }) => ({
        stage: { order: group.order, name: group.name },
        from,
        excluded,
      }))
  );
  const everyStage = resolution.everyStage.flatMap((group) =>
    group.skills.filter(({ skill }) => skill.id === skillId)
  );
  if (everyStage.length > 0) {
    const from: SkillOrigin[] = [];
    everyStage.forEach((entry) =>
      entry.from.forEach((origin) => {
        if (!from.some((other) => originKey(other) === originKey(origin))) {
          from.push(origin);
        }
      })
    );
    placements.push({
      from,
      excluded: everyStage.every(({ excluded }) => excluded),
    });
  }
  return placements;
};

// ---------------------------------------------------------------------------
// Names (snapshots are re-named on read, like every other ref)
// ---------------------------------------------------------------------------

const hubName = (ref: HubRef, name: string | undefined): HubRef => ({
  id: ref.id,
  name: name ?? ref.name,
});

const presentOrigin = (origin: SkillOrigin): SkillOrigin => {
  switch (origin.kind) {
    case "agent":
      return { kind: "agent", agent: resolveAgentRef(origin.agent) };
    case "collection":
      return {
        kind: "collection",
        agent: resolveAgentRef(origin.agent),
        collection: resolveCollectionRef(origin.collection),
      };
    case "archetype":
      return {
        kind: "archetype",
        archetype: hubName(
          origin.archetype,
          findArchetype(origin.archetype.id)?.name
        ),
      };
    case "targetProfile":
      return {
        kind: "targetProfile",
        targetProfile: hubName(
          origin.targetProfile,
          findTargetProfile(origin.targetProfile.id)?.profile.name
        ),
        archetype: hubName(
          origin.archetype,
          findArchetype(origin.archetype.id)?.name
        ),
      };
    case "application":
      return {
        kind: "application",
        application: hubName(
          origin.application,
          findApplication(origin.application.id)?.name
        ),
      };
  }
};

const presentStageSkill = (entry: StageSkill): StageSkill => ({
  ...entry,
  skill: resolveSkillRef(entry.skill),
  from: entry.from.map(presentOrigin),
});

/** A stored resolution with current names. */
export const presentSkillsByStage = (
  resolution: SkillsByStage
): SkillsByStage => ({
  stages: resolution.stages.map((group) => ({
    ...group,
    agent: resolveAgentRef(group.agent),
    skills: group.skills.map(presentStageSkill),
  })),
  everyStage: resolution.everyStage.map((group) => ({
    ...(group.application
      ? {
          application: hubName(
            group.application,
            findApplication(group.application.id)?.name
          ),
        }
      : {}),
    skills: group.skills.map(presentStageSkill),
  })),
});
