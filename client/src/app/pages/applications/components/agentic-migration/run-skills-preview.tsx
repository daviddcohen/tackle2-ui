import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Content,
  ExpandableSection,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";
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

/** The plans list the dialog's groups take their stages from. */
export interface RunPlansStatus {
  isLoading: boolean;
  /** The list failed to load: no group can say its plan is gone. */
  isError: boolean;
  refetch: () => void;
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
  plansStatus: RunPlansStatus,
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
      ((request == null && plansStatus.isLoading) ||
        (request != null &&
          isFetching &&
          (skillsByStage == null || fetchError != null)));
    // Without its plan nothing can be resolved for the group, which is an
    // error, not a server that does not report skills. When the plans list
    // failed, retrying it can help; when it loaded without this plan
    // (deleted meanwhile), nothing can.
    const isPlanMissing =
      ownSkills == null &&
      group.migrationPlan == null &&
      !plansStatus.isLoading;
    const isPlanGone = isPlanMissing && !plansStatus.isError;
    return {
      skills: ownSkills ?? (isMissing ? undefined : skillsByStage),
      isLoading,
      isError:
        isPlanMissing ||
        (ownSkills == null && fetchError != null && !isMissing && !isLoading),
      onRetry: isPlanGone
        ? undefined
        : isPlanMissing
          ? plansStatus.refetch
          : () => void refetch(),
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
 * until asked for; the toggle reads as an action ("Review skills by stage")
 * and counts the run's exclusions. Opening it scrolls it to the top of the
 * modal body, so the table is what the user sees. Names are plain text: a
 * link would close the dialog and lose its choices. Loading and errors
 * never block Run.
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
  const isSeveral = groups.length > 1;

  // Opened by the user (not by default): once the content is there, bring
  // the section to the top of the modal body. Below the run options it
  // would otherwise open under the footer, as if nothing happened. While
  // a table loads the body may be too short to bring it all the way, so
  // it scrolls again when the tables are in, unless the user has moved on
  // meanwhile (scrolled, touched, typed or clicked). Not when it only asks
  // for a plan or a target profile: the selects it points to are above.
  // Focus stays on the toggle.
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const isScrollPending = React.useRef(false);
  const isAnyLoading = skills.some((group) => group.isLoading);
  React.useEffect(() => {
    if (!isExpanded || !isScrollPending.current) return;
    if (!isAnyLoading) isScrollPending.current = false;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    sectionRef.current?.scrollIntoView?.({
      block: "start",
      behavior: reducedMotion ? "auto" : "smooth",
    });
    if (!isScrollPending.current) return;
    const cancel = () => {
      isScrollPending.current = false;
    };
    const events = ["wheel", "touchstart", "keydown", "pointerdown"];
    events.forEach((event) =>
      document.addEventListener(event, cancel, { capture: true, passive: true })
    );
    return () =>
      events.forEach((event) =>
        document.removeEventListener(event, cancel, { capture: true })
      );
  }, [isExpanded, isAnyLoading]);

  // One paragraph, like the wizard's Skills step. The "Every stage:
  // {application}" titles say which skills go to one application only.
  const intro = [
    t("agentic.runSkills.intro"),
    isRerun ? t("agentic.execution.previewRerun") : null,
    isRerun && hasRerunExclusions ? t("agentic.runSkills.rerunExcluded") : null,
  ]
    .filter((sentence): sentence is string => sentence != null)
    .join(" ");

  return (
    <div ref={sectionRef}>
      <ExpandableSection
        toggleId="migration-preflight-skills-toggle"
        contentId="migration-preflight-skills"
        toggleText={
          excludedCount > 0
            ? t("agentic.runSkills.toggleExcluded", { count: excludedCount })
            : t("agentic.runSkills.toggle")
        }
        isExpanded={isExpanded}
        onToggle={(_event, expanded) => {
          isScrollPending.current =
            expanded && !isPlanMissing && !isTargetProfileMissing;
          onExpandedChange(expanded);
        }}
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
                <StackItem>
                  <Content component="p" className={textStyles.textColorSubtle}>
                    {intro}
                  </Content>
                </StackItem>
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
    </div>
  );
};

/**
 * One plan run's table, with the run's exclusions marked on the plan's and
 * a polite live line for screen readers: after a change, that change and
 * the run's total. Sighted users see the toggle's count and the row labels.
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
  const excludedTotal = runExclusionsToSend(skills, excludedIds).length;
  const totalText = t("agentic.runSkills.excludedTotal", {
    count: excludedTotal,
  });
  // Empty until a change, and always mounted, so the change is announced.
  const liveText = changeText != null ? `${changeText} ${totalText}` : "";

  return (
    <Stack hasGutter>
      {isSeveral && (
        <StackItem>
          <Title headingLevel="h2" size="md">
            {title}
          </Title>
        </StackItem>
      )}
      <StackItem>
        <div aria-live="polite" className={a11yStyles.screenReader}>
          {liveText}
        </div>
        <StageSkillsTable
          skills={shown}
          context="run"
          // The review is already the "show me" gesture, so the stage
          // groups are open. With 2 or more applications each one's Every
          // stage group starts collapsed and shows its skill count: the
          // dialog is a small box, unlike the plan run page.
          defaultExpanded={group.applications.length > 1 ? "stages" : "all"}
          groupHeadingLevel={isSeveral ? "h3" : "h2"}
          rowIndexOffset={rowIndexOffset}
          include={
            canInclude
              ? {
                  onChange: (skill, included) => {
                    setLastChange({ skill, included });
                    onIncludeChange(skill, included);
                  },
                  isLocked: isPlanExcluded,
                  // One decision per skill: clearing any row clears them all.
                  label: (skill) =>
                    t("agentic.runSkills.includeInRun", { skill: skill.name }),
                }
              : undefined
          }
          excludedLabel={(entry) =>
            isPlanExcluded(entry)
              ? {
                  text: t("agentic.runSkills.excludedByPlan"),
                  tooltip: t("agentic.runSkills.excludedByPlanTooltip"),
                }
              : { text: t("agentic.runSkills.excludedForRun") }
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
