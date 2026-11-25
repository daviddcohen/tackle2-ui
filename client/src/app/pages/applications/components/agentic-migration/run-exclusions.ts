import { EntityId, SkillsByStage, StageSkill } from "@app/agentic";
import { isAttachedToApplication } from "@app/pages/agentic/components/stage-skills-table";

const allEntries = (skills: SkillsByStage): StageSkill[] => [
  ...skills.stages.flatMap((group) => group.skills),
  ...skills.everyStage.flatMap((group) => group.skills),
];

/**
 * The skills a run's plan excludes, read from a resolution made with the
 * plan's exclusions: a skill with any row the server marked excluded.
 */
export const planExcludedSkillIds = (skills: SkillsByStage): Set<EntityId> =>
  new Set(
    allEntries(skills)
      .filter(({ excluded }) => excluded)
      .map(({ skill }) => skill.id)
  );

/**
 * A row the plan excludes: it stays excluded whatever the run does. A
 * plan exclusion never reaches a skill attached to the application itself,
 * so that row can still be cleared for the run.
 */
export const isPlanExcludedRow =
  (planExcluded: ReadonlySet<EntityId>) => (entry: StageSkill) =>
    planExcluded.has(entry.skill.id) && !isAttachedToApplication(entry);

/**
 * The resolution as the run would get it: a run exclusion is per plan run
 * and marks every row of the skill, in every stage and every application,
 * whatever its origin, on top of the plan's.
 */
export const withRunExclusions = (
  skills: SkillsByStage,
  excludedIds: readonly EntityId[]
): SkillsByStage => {
  const excluded = new Set(excludedIds);
  const mark = (entry: StageSkill): StageSkill =>
    excluded.has(entry.skill.id) ? { ...entry, excluded: true } : entry;
  return {
    stages: skills.stages.map((group) => ({
      ...group,
      skills: group.skills.map(mark),
    })),
    everyStage: skills.everyStage.map((group) => ({
      ...group,
      skills: group.skills.map(mark),
    })),
  };
};

/**
 * The run exclusions Run sends for one plan run: those the resolution still
 * lists in a row the plan does not already exclude, in the order given.
 * Without a resolution (not reported, failed) they are sent as kept: the
 * server ignores the ones its snapshot does not list.
 */
export const runExclusionsToSend = (
  skills: SkillsByStage | undefined,
  excludedIds: readonly EntityId[]
): EntityId[] => {
  if (skills == null) return [...excludedIds];
  const isPlanExcluded = isPlanExcludedRow(planExcludedSkillIds(skills));
  const changeable = new Set(
    allEntries(skills)
      .filter((entry) => !isPlanExcluded(entry))
      .map(({ skill }) => skill.id)
  );
  return excludedIds.filter((skillId) => changeable.has(skillId));
};
