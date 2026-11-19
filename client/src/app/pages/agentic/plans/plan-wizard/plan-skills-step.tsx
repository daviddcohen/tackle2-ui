import * as React from "react";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertActionLink,
  Content,
  Skeleton,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { EntityId, EntityRef, SkillsByStage, StageSkill } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PlanSkillsQuery, planSkillsState } from "@app/queries/agentic";

import { StageSkillsTable } from "../../components/stage-skills-table";

/** A draft stage the resolve request holds, by position: its number and name. */
export interface DraftStageTitle {
  order: number;
  name: string;
}

/**
 * The draft as the Skills step shows it: the server's groups, named
 * and numbered after the wizard's stages (the request leaves out stages
 * without an agent, and holds no names, so typing one refetches nothing),
 * and marked excluded by the wizard's unsaved exclusions instead of the
 * server's flag. An exclusion is per plan: it marks every row of the skill,
 * except a skill attached to the application itself (never excludable).
 */
export const draftSkillsByStage = (
  skills: SkillsByStage,
  stageTitles: DraftStageTitle[],
  excludedIds: EntityId[]
): SkillsByStage => {
  const mark = (entry: StageSkill): StageSkill => ({
    ...entry,
    excluded:
      excludedIds.includes(entry.skill.id) &&
      !entry.from.some((origin) => origin.kind === "application"),
  });
  return {
    stages: skills.stages.map((group, index) => ({
      ...group,
      order: stageTitles[index]?.order ?? group.order,
      name: stageTitles[index]?.name ?? group.name,
      skills: group.skills.map(mark),
    })),
    everyStage: skills.everyStage.map((group) => ({
      ...group,
      skills: group.skills.map(mark),
    })),
  };
};

/** Every skill of the draft once, in name order. */
export const draftSkills = (skills: SkillsByStage): EntityRef[] => {
  const byId = new Map<EntityId, EntityRef>();
  for (const group of [...skills.stages, ...skills.everyStage]) {
    for (const { skill } of group.skills) {
      byId.set(skill.id, skill);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Where a skill sits in the draft: "every stage" when an Every stage group
 * has it, else "stage 3" or "stages 1 and 3". Undefined when the draft does
 * not have it (an exclusion that no longer resolves).
 */
export const skillStagesText = (
  t: TFunction,
  skills: SkillsByStage,
  skillId: EntityId
): string | undefined => {
  const has = (entries: StageSkill[]) =>
    entries.some(({ skill }) => skill.id === skillId);
  if (skills.everyStage.some((group) => has(group.skills))) {
    return t("agentic.plan.stagesListEvery");
  }
  const numbers = skills.stages
    .filter((group) => has(group.skills))
    .map((group) => group.order)
    .sort((a, b) => a - b)
    .map(String);
  return numbers.length > 0
    ? t("agentic.plan.stagesList", { count: numbers.length, numbers })
    : undefined;
};

/** The excluded skills of the draft that it still has, in name order. */
const excludedDraftSkills = (skills: SkillsByStage, excludedIds: EntityId[]) =>
  draftSkills(skills).filter((skill) => excludedIds.includes(skill.id));

/** A retry shows its progress at least this long, even when it fails fast. */
const MIN_RETRY_PROGRESS_MS = 500;

export interface PlanSkillsStepProps {
  query: PlanSkillsQuery;
  /** The request's stages, in order: the group titles. */
  stageTitles: DraftStageTitle[];
  /** The draft's archetype: its target profiles need no archetype suffix. */
  archetypeId?: number;
  excludedIds: EntityId[];
  onIncludeChange: (skill: EntityRef, included: boolean) => void;
  isEdit: boolean;
}

/**
 * The Skills step: Skills by stage for the draft, each stage then
 * Every stage, with an Include checkbox per row. An exclusion is per plan:
 * clearing a skill clears it in every stage that has it. A live line names
 * the last change and its stages, then the total. Loading or failing never
 * blocks Next or Save.
 */
export const PlanSkillsStep: React.FC<PlanSkillsStepProps> = ({
  query,
  stageTitles,
  archetypeId,
  excludedIds,
  onIncludeChange,
  isEdit,
}) => {
  const { t } = useTranslation();
  const state = planSkillsState(query);
  // The last change, for the live line; cleared when the draft resolves anew.
  const [lastChange, setLastChange] = React.useState<{
    skill: EntityRef;
    included: boolean;
  }>();
  const resolved = query.skillsByStage;
  React.useEffect(() => setLastChange(undefined), [resolved]);
  // A retry keeps the alert, and the focused "Try again", in place until the
  // request settles: unmounting it would drop focus to the page body. On
  // success focus moves to what replaces the alert: the count line, or the
  // empty state when nothing resolves. A failed retry forgets the request, so
  // a later background refetch cannot move focus. The query clears its error
  // while it refetches, so the step tracks the retry itself. The progress
  // stays up at least MIN_RETRY_PROGRESS_MS, so a fast failure still shows
  // that the retry ran, and a failed retry says so in the alert title.
  const [isRetryPending, setIsRetryPending] = React.useState(false);
  const [hasRetryFailed, setHasRetryFailed] = React.useState(false);
  const retriedRef = React.useRef(false);
  const resultRef = React.useRef<HTMLDivElement>(null);
  const isMountedRef = React.useRef(true);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(retryTimerRef.current);
    };
  }, []);
  React.useEffect(() => {
    if (state === "ready" && !isRetryPending) {
      setHasRetryFailed(false);
      if (retriedRef.current) {
        retriedRef.current = false;
        resultRef.current?.focus();
      }
    }
  }, [state, isRetryPending]);

  // The intro points at the rows, so it shows only while they load and with
  // the table, not in the error states.
  const intro = (
    <StackItem>
      <Content component="p" className={textStyles.textColorSubtle}>
        {/* The plan page's Every stage note, after the first sentence, as
            in the plan page's section description. */}
        {t("agentic.plan.skillsIntro", {
          everyStage:
            archetypeId != null
              ? t("agentic.stageSkills.everyStagePlanNote")
              : t("agentic.stageSkills.everyStageNoPath"),
        })}
      </Content>
    </StackItem>
  );

  const retry = () => {
    retriedRef.current = true;
    setIsRetryPending(true);
    const minimum = new Promise((resolve) => {
      retryTimerRef.current = setTimeout(resolve, MIN_RETRY_PROGRESS_MS);
    });
    void Promise.all([query.refetch(), minimum])
      .then(([result]) => result.isError)
      .catch(() => true)
      .then((isError) => {
        if (!isMountedRef.current) return;
        if (isError) {
          retriedRef.current = false;
        }
        setHasRetryFailed(isError);
        setIsRetryPending(false);
      });
  };

  if (state === "loading" && !isRetryPending) {
    return (
      <Stack hasGutter>
        {intro}
        <StackItem>
          <Content component="p">{t("agentic.plan.loadingSkills")}</Content>
        </StackItem>
        {/* The sentence above is the loading text; the skeletons stay silent. */}
        {[0, 1, 2, 3].map((line) => (
          <StackItem key={line}>
            <Skeleton height="1.5rem" />
          </StackItem>
        ))}
      </Stack>
    );
  }

  // A server without the resolve endpoint: retrying cannot help, so the step
  // says so once, with no retry. The plan can still be created or saved.
  if (state === "unavailable" && !isRetryPending) {
    return (
      <Stack hasGutter>
        <StackItem>
          <Alert
            variant="info"
            isInline
            isPlain
            title={t("agentic.plan.skillsNotAvailable")}
          >
            {isEdit
              ? t("agentic.plan.skillsNotAvailableEdit")
              : t("agentic.plan.skillsNotAvailableCreate")}
          </Alert>
        </StackItem>
      </Stack>
    );
  }

  if (state === "error" || isRetryPending) {
    return (
      <Stack hasGutter>
        <StackItem>
          <Alert
            variant="danger"
            isInline
            isPlain
            isLiveRegion
            title={
              hasRetryFailed
                ? t("agentic.plan.skillsStillLoadFailed")
                : t("agentic.plan.skillsLoadFailed")
            }
            actionLinks={
              <AlertActionLink
                isAriaDisabled={isRetryPending}
                isLoading={isRetryPending}
                onClick={retry}
              >
                {t("agentic.plan.retrySkills")}
              </AlertActionLink>
            }
          >
            {hasRetryFailed
              ? isEdit
                ? t("agentic.plan.skillsStillLoadFailedEdit")
                : t("agentic.plan.skillsStillLoadFailedCreate")
              : isEdit
                ? t("agentic.plan.skillsLoadFailedEdit")
                : t("agentic.plan.skillsLoadFailedCreate")}
          </Alert>
        </StackItem>
      </Stack>
    );
  }

  const draft = draftSkillsByStage(
    resolved ?? { stages: [], everyStage: [] },
    stageTitles,
    excludedIds
  );
  const excludedCount = excludedDraftSkills(draft, excludedIds).length;
  const changeText =
    lastChange != null
      ? t(
          lastChange.included
            ? "agentic.plan.skillChangeIncluded"
            : "agentic.plan.skillChangeExcluded",
          {
            skill: lastChange.skill.name,
            stages:
              skillStagesText(t, draft, lastChange.skill.id) ??
              t("agentic.plan.stagesListEvery"),
          }
        )
      : undefined;
  const totalText = t("agentic.plan.skillsExcludedTotal", {
    count: excludedCount,
  });

  return (
    <Stack hasGutter>
      {intro}
      {draft.stages.length > 0 && (
        <StackItem>
          <div ref={resultRef} tabIndex={-1}>
            <Content component="p" aria-live="polite">
              {changeText != null ? `${changeText} ${totalText}` : totalText}
            </Content>
          </div>
        </StackItem>
      )}
      <StackItem>
        <div
          ref={draft.stages.length > 0 ? undefined : resultRef}
          tabIndex={-1}
        >
          <StageSkillsTable
            skills={draft}
            context="plan"
            include={{
              onChange: (skill, included) => {
                setLastChange({ skill, included });
                onIncludeChange(skill, included);
              },
            }}
            groupHeadingLevel="h2"
            // Over the plan page (0 and 100) and the Review table (200).
            rowIndexOffset={300}
            originOptions={{ archetypeId }}
            aria-label={t("agentic.stageSkills.title")}
          />
        </div>
      </StackItem>
    </Stack>
  );
};

export interface PlanSkillsSummaryProps {
  query: PlanSkillsQuery;
  stageTitles: DraftStageTitle[];
  excludedIds: EntityId[];
  /** The saved plan's exclusions, in edit mode: the lines name the changes. */
  savedExcluded?: EntityRef[];
}

/**
 * The "Excluded skills" fact on the Review step: "None", or one
 * line per excluded skill with its stages ("Quarkus best practices (every
 * stage)"); no count of skills. In edit mode each excluded skill appears
 * once, grouped by what the save changes. A saved exclusion that no longer
 * resolves is "No longer excluded": the save drops it.
 */
export const PlanSkillsSummary: React.FC<PlanSkillsSummaryProps> = ({
  query,
  stageTitles,
  excludedIds,
  savedExcluded,
}) => {
  const { t } = useTranslation();
  const state = planSkillsState(query);
  if (state === "loading") {
    return (
      <Skeleton
        width="12rem"
        screenreaderText={t("agentic.plan.loadingSkillsShort")}
      />
    );
  }
  if (state === "error" || state === "unavailable") {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }

  const draft = draftSkillsByStage(
    query.skillsByStage ?? { stages: [], everyStage: [] },
    stageTitles,
    excludedIds
  );
  const named = (skill: EntityRef) => {
    const stages = skillStagesText(t, draft, skill.id);
    return stages != null
      ? t("agentic.plan.reviewExcludedSkill", { skill: skill.name, stages })
      : skill.name;
  };
  const excluded = excludedDraftSkills(draft, excludedIds);

  if (savedExcluded == null) {
    return excluded.length === 0 ? (
      <EmptyTextMessage message={t("terms.none")} />
    ) : (
      <Stack>
        {excluded.map((skill) => (
          <StackItem key={skill.id}>{named(skill)}</StackItem>
        ))}
      </Stack>
    );
  }

  const savedIds = new Set(savedExcluded.map((skill) => skill.id));
  const excludedIdSet = new Set(excluded.map((skill) => skill.id));
  const byName = (skills: EntityRef[]) =>
    [...skills].sort((a, b) => a.name.localeCompare(b.name));
  const groups: [string, EntityRef[]][] = [
    [
      "agentic.plan.skillsNewlyExcluded",
      excluded.filter((skill) => !savedIds.has(skill.id)),
    ],
    [
      "agentic.plan.skillsNoLongerExcluded",
      byName(savedExcluded.filter((skill) => !excludedIdSet.has(skill.id))),
    ],
    [
      "agentic.plan.skillsStillExcluded",
      excluded.filter((skill) => savedIds.has(skill.id)),
    ],
  ];
  const shown = groups.filter(([, skills]) => skills.length > 0);
  // Under "Excluded skills", a lone "Newly excluded:" or "Still excluded:"
  // only repeats the term: the names say enough. The
  // prefixes tell the groups apart once there are several, and "No longer
  // excluded" always needs its own.
  const isPlain =
    shown.length === 1 && shown[0][0] !== "agentic.plan.skillsNoLongerExcluded";
  if (isPlain) {
    return (
      <Stack>
        {shown[0][1].map((skill) => (
          <StackItem key={skill.id}>{named(skill)}</StackItem>
        ))}
      </Stack>
    );
  }
  const lines = shown.map(([key, skills]) =>
    t(key, { names: skills.map(named).join(", ") })
  );
  return lines.length === 0 ? (
    <EmptyTextMessage message={t("terms.none")} />
  ) : (
    <Stack>
      {lines.map((line) => (
        <StackItem key={line}>{line}</StackItem>
      ))}
    </Stack>
  );
};
