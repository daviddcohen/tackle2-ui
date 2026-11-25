import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  ExpandableSection,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  ApplicationMigrationView,
  EntityId,
  EntityRef,
  ResolvePlanSkillsRequest,
  SkillsByStage,
} from "@app/agentic";
import { StageSkillsTable } from "@app/pages/agentic/components/stage-skills-table";
import { skillStagesText } from "@app/pages/agentic/plans/plan-wizard/plan-skills-step";
import {
  isResolveEndpointMissing,
  useResolvePlanSkillsList,
} from "@app/queries/agentic";

import {
  isPlanExcludedRow,
  planExcludedSkillIds,
  runExclusionsToSend,
  withRunExclusions,
} from "./run-exclusions";
import { StartGroup } from "./start-groups";

/**
 * The dialog's tables name their toggles by `simple-node{n}` (PF): each
 * table gets its own range, after the plan page (0, 100), Review (200) and
 * the wizard (300).
 */
const ROW_INDEX_OFFSET = 400;
const ROW_INDEX_STEP = 100;

/** One plan run's skills, as the dialog previews them. */
export interface RunGroupSkills {
  /**
   * What each stage gets, marked excluded by the plan only. Undefined while
   * loading, on an error, or when the server does not report it.
   */
  skills?: SkillsByStage;
  isLoading: boolean;
  isError: boolean;
  /** Absent when retrying cannot help (the plan is gone). */
  onRetry?: () => void;
}

/**
 * The skills of each plan run Run starts, in group order. One application
 * on its own plan and its default target profile reads the skills its
 * migration view already has; any other group asks the resolver for the
 * plan's stages (with the plan's exclusions) and these applications, each
 * with its target profile pick. A group still waiting for a target profile
 * asks nothing. Nothing is fetched unless `enabled`.
 */
export const useRunGroupSkills = (
  groups: StartGroup[],
  migrations: Record<number, ApplicationMigrationView | undefined>,
  isLoadingPlans: boolean,
  enabled: boolean
): RunGroupSkills[] => {
  const inputs = groups.map((group) => {
    const [first] = group.applications;
    const own =
      group.applications.length === 1 ? migrations[first.id] : undefined;
    const pick = group.targetProfiles.get(first?.id);
    const ownSkills =
      own?.plan?.id === group.plan.id &&
      (pick === undefined || pick === (own.targetProfile?.id ?? null))
        ? own.skills
        : undefined;
    const { migrationPlan } = group;
    const request: ResolvePlanSkillsRequest | undefined =
      ownSkills != null || migrationPlan == null || group.isTargetProfileMissing
        ? undefined
        : {
            stages: [...migrationPlan.stages]
              .sort((a, b) => a.order - b.order)
              .map((stage) => ({
                agent: { id: stage.agent.id },
                name: stage.name,
              })),
            excludedSkills: (migrationPlan.excludedSkills ?? []).map(
              (skill) => ({ id: skill.id })
            ),
            applications: group.applications.map(({ id }) => {
              const targetProfile = group.targetProfiles.get(id);
              return {
                id,
                ...(targetProfile !== undefined
                  ? {
                      targetProfile:
                        targetProfile === null ? null : { id: targetProfile },
                    }
                  : {}),
              };
            }),
          };
    return { group, ownSkills, request };
  });
  const queries = useResolvePlanSkillsList(
    inputs.map(({ request }) => request),
    { enabled }
  );
  return inputs.map(({ group, ownSkills, request }, index) => {
    const { skillsByStage, isFetching, fetchError, refetch } = queries[index];
    const isMissing =
      fetchError != null && isResolveEndpointMissing(fetchError);
    const isLoading =
      ownSkills == null &&
      ((request == null && isLoadingPlans) ||
        (request != null &&
          isFetching &&
          (skillsByStage == null || fetchError != null)));
    // The plans list loaded without this plan (deleted meanwhile): nothing
    // can be resolved for it, which is an error, not a server that does not
    // report skills.
    const isPlanGone =
      ownSkills == null && group.migrationPlan == null && !isLoadingPlans;
    return {
      skills: ownSkills ?? (isMissing ? undefined : skillsByStage),
      isLoading,
      isError:
        isPlanGone ||
        (ownSkills == null && fetchError != null && !isMissing && !isLoading),
      onRetry: isPlanGone ? undefined : () => void refetch(),
    };
  });
};

export interface RunSkillsPreviewProps {
  /** The runs Run starts (`groupReadyApplicationsByPlan`), in order. */
  groups: StartGroup[];
  /** Each group's skills (`useRunGroupSkills`), in the same order. */
  skills: RunGroupSkills[];
  /** The skills each plan run excludes on its own, by plan id. */
  excludedSkills: Readonly<Record<EntityId, readonly EntityId[]>>;
  /** How many skills Run excludes on its own, every plan run together. */
  excludedCount: number;
  onIncludeChange: (
    planId: EntityId,
    skill: EntityRef,
    included: boolean
  ) => void;
  /** "Use one migration plan for all applications" without a plan picked yet. */
  isPlanMissing: boolean;
  /** An application Run would start still needs a target profile. */
  isTargetProfileMissing: boolean;
  /** Opened to run a failed run again: the new run resolves the skills afresh. */
  isRerun: boolean;
  /** Run still sends some of the failed run's own exclusions. */
  hasRerunExclusions: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}

/**
 * "Skills by stage" in the Run migration plan dialog:
 * what each stage's agent gets in each plan run Run starts, built
 * from the same groups as the start request, with an Include checkbox per
 * row. Clearing a skill excludes it from that plan run only, in every stage
 * and for every application; the plan's own exclusions stay. Collapsed
 * until asked for (its toggle counts the run's exclusions), and every
 * group in it starts collapsed. Names are plain text: a link would close
 * the dialog and lose its choices. Loading and errors never block Run.
 */
export const RunSkillsPreview: React.FC<RunSkillsPreviewProps> = ({
  groups,
  skills,
  excludedSkills,
  excludedCount,
  onIncludeChange,
  isPlanMissing,
  isTargetProfileMissing,
  isRerun,
  hasRerunExclusions,
  isExpanded,
  onExpandedChange,
}) => {
  const { t } = useTranslation();
  const applicationCount = groups.reduce(
    (count, group) => count + group.applications.length,
    0
  );
  const isSeveral = groups.length > 1;

  const only =
    groups.length === 1 && groups[0].applications.length === 1
      ? groups[0]
      : undefined;
  const sentences = [
    only != null
      ? t("agentic.execution.previewOneDescription", {
          plan: only.plan.name,
          application: only.applications[0].name,
        })
      : null,
    t("agentic.runSkills.intro"),
    isRerun ? t("agentic.execution.previewRerun") : null,
    isRerun && hasRerunExclusions ? t("agentic.runSkills.rerunExcluded") : null,
    // Said once, whenever more than one application is covered.
    applicationCount > 1
      ? t("agentic.stageSkills.everyStagePerApplication")
      : null,
  ].filter((sentence): sentence is string => sentence != null);

  return (
    <ExpandableSection
      toggleId="migration-preflight-skills-toggle"
      contentId="migration-preflight-skills"
      toggleText={
        excludedCount > 0
          ? t("agentic.runSkills.toggleExcluded", { count: excludedCount })
          : t("agentic.stageSkills.title")
      }
      isExpanded={isExpanded}
      onToggle={(_event, expanded) => onExpandedChange(expanded)}
      isIndented
    >
      {isExpanded && (
        <Stack hasGutter>
          {isPlanMissing || isTargetProfileMissing ? (
            <StackItem>
              <Content component="p">
                {isPlanMissing
                  ? t("agentic.execution.previewSelectPlan")
                  : t("agentic.runSkills.previewSelectProfile")}
              </Content>
            </StackItem>
          ) : (
            <>
              {sentences.map((sentence) => (
                <StackItem key={sentence}>
                  <Content component="p" className={textStyles.textColorSubtle}>
                    {sentence}
                  </Content>
                </StackItem>
              ))}
              {groups.map((group, index) => (
                <StackItem key={group.plan.id}>
                  <RunGroupPreview
                    group={group}
                    resolution={skills[index]}
                    excludedIds={excludedSkills[group.plan.id] ?? []}
                    onIncludeChange={(skill, included) =>
                      onIncludeChange(group.plan.id, skill, included)
                    }
                    isSeveral={isSeveral}
                    rowIndexOffset={ROW_INDEX_OFFSET + index * ROW_INDEX_STEP}
                  />
                </StackItem>
              ))}
            </>
          )}
        </Stack>
      )}
    </ExpandableSection>
  );
};

/**
 * One plan run's table, with the run's exclusions marked on the plan's and
 * a polite live line above it: the last change and the run's total.
 */
const RunGroupPreview: React.FC<{
  group: StartGroup;
  resolution: RunGroupSkills;
  excludedIds: readonly EntityId[];
  onIncludeChange: (skill: EntityRef, included: boolean) => void;
  isSeveral: boolean;
  rowIndexOffset: number;
}> = ({
  group,
  resolution,
  excludedIds,
  onIncludeChange,
  isSeveral,
  rowIndexOffset,
}) => {
  const { t } = useTranslation();
  const { skills, isLoading, isError, onRetry } = resolution;
  // The last change, for the live line; cleared when the run resolves anew.
  const [lastChange, setLastChange] = React.useState<{
    skill: EntityRef;
    included: boolean;
  }>();
  React.useEffect(() => setLastChange(undefined), [skills]);

  const title = t("agentic.execution.previewRunTitle", {
    plan: group.plan.name,
    count: group.applications.length,
  });
  const heading = isSeveral ? (
    <StackItem>
      <Title headingLevel="h2" size="md">
        {title}
      </Title>
    </StackItem>
  ) : null;

  const canInclude = skills != null && !isLoading && !isError;
  const isPlanExcluded = isPlanExcludedRow(
    skills != null ? planExcludedSkillIds(skills) : new Set()
  );
  const shown =
    skills != null ? withRunExclusions(skills, excludedIds) : undefined;
  const changeText =
    lastChange != null && shown != null
      ? t(
          lastChange.included
            ? "agentic.plan.skillChangeIncluded"
            : "agentic.plan.skillChangeExcluded",
          {
            skill: lastChange.skill.name,
            stages:
              skillStagesText(t, shown, lastChange.skill.id) ??
              t("agentic.plan.stagesListEvery"),
          }
        )
      : undefined;
  const totalText = t("agentic.runSkills.excludedTotal", {
    count: runExclusionsToSend(skills, excludedIds).length,
  });

  return (
    <Stack hasGutter>
      {heading}
      {canInclude && shown != null && shown.stages.length > 0 && (
        <StackItem>
          <Content component="p" aria-live="polite">
            {changeText != null ? `${changeText} ${totalText}` : totalText}
          </Content>
        </StackItem>
      )}
      <StackItem>
        <StageSkillsTable
          skills={shown}
          context="run"
          defaultExpanded="none"
          groupHeadingLevel={isSeveral ? "h3" : "h2"}
          rowIndexOffset={rowIndexOffset}
          // A target profile of the plan's own archetype needs no archetype name.
          originOptions={{
            archetypeId: group.migrationPlan?.migrationPath?.archetype.id,
          }}
          include={
            canInclude
              ? {
                  onChange: (skill, included) => {
                    setLastChange({ skill, included });
                    onIncludeChange(skill, included);
                  },
                  isLocked: isPlanExcluded,
                  excludedLabel: (entry) =>
                    isPlanExcluded(entry)
                      ? t("agentic.runSkills.excludedByPlan")
                      : undefined,
                }
              : undefined
          }
          unavailableText={t("agentic.execution.previewSkillsUnavailable")}
          aria-label={
            isSeveral
              ? t("agentic.execution.previewTableLabel", {
                  plan: group.plan.name,
                })
              : t("agentic.stageSkills.title")
          }
          isLoading={isLoading}
          isError={isError}
          errorBody={t("agentic.execution.previewRunAnyway")}
          onRetry={onRetry}
        />
      </StackItem>
    </Stack>
  );
};
