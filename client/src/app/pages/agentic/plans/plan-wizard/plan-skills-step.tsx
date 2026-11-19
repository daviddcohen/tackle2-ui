import * as React from "react";
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

import { EntityId, EntityRef, PlanSkill } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { PlanSkillsQuery, planSkillsState } from "@app/queries/agentic";

import { SectionEmpty } from "../../components/detail-section";
import {
  SkillsTable,
  SkillsTableRow,
  planSkillRows,
  skillRowCounts,
} from "../../components/skills-table";

/**
 * Rows for the draft: the server's skills and sources, marked excluded
 * by the wizard's unsaved exclusions instead of the server's flag.
 */
const draftSkillRows = (
  planSkills: PlanSkill[],
  excludedIds: EntityId[]
): SkillsTableRow[] =>
  planSkillRows(
    planSkills.map((entry) => ({
      ...entry,
      excluded: excludedIds.includes(entry.skill.id),
    }))
  );

/** A retry shows its progress at least this long, even when it fails fast. */
const MIN_RETRY_PROGRESS_MS = 500;

export interface PlanSkillsStepProps {
  query: PlanSkillsQuery;
  excludedIds: EntityId[];
  onUsedChange: (skill: EntityRef, used: boolean) => void;
  isEdit: boolean;
}

/**
 * The Skills step (design spec 3.1): every skill the draft's agents, their
 * skill collections, the archetype and the target profiles give the plan,
 * with a checkbox per skill. Clearing one excludes it from every stage.
 * Loading or failing never blocks Next.
 */
export const PlanSkillsStep: React.FC<PlanSkillsStepProps> = ({
  query,
  excludedIds,
  onUsedChange,
  isEdit,
}) => {
  const { t } = useTranslation();
  const state = planSkillsState(query);
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
  // the table, not in the error and empty states.
  const intro = (
    <StackItem>
      <Content component="p" className={textStyles.textColorSubtle}>
        {t("agentic.plan.skillsIntro")}
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

  const rows = draftSkillRows(query.planSkills ?? [], excludedIds);
  if (rows.length === 0) {
    return (
      <Stack hasGutter>
        <StackItem>
          <div ref={resultRef} tabIndex={-1}>
            <SectionEmpty>{t("agentic.plan.skillsEmpty")}</SectionEmpty>
          </div>
        </StackItem>
      </Stack>
    );
  }

  return (
    <Stack hasGutter>
      {intro}
      <StackItem>
        <div ref={resultRef} tabIndex={-1}>
          <Content component="p" aria-live="polite">
            {t("agentic.plan.skillsUsed", {
              used: skillRowCounts(rows).used,
              count: rows.length,
            })}
          </Content>
        </div>
      </StackItem>
      <StackItem>
        <SkillsTable rows={rows} onUsedChange={onUsedChange} />
      </StackItem>
    </Stack>
  );
};

/** Skill names in name order, as one list. */
const names = (skills: EntityRef[]) =>
  skills
    .map((skill) => skill.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");

export interface PlanSkillsSummaryProps {
  query: PlanSkillsQuery;
  excludedIds: EntityId[];
  /** The saved plan's exclusions, in edit mode: the lines name the changes. */
  savedExcluded?: EntityRef[];
}

/**
 * The Skills fact on the Review step (design spec 3.2): "8 skills", or
 * "6 of 8 used" with the excluded skills by name. In edit mode each excluded
 * name appears once, grouped by what the save changes. A saved exclusion
 * that no longer resolves is "No longer excluded": the save drops it.
 */
export const PlanSkillsSummary: React.FC<PlanSkillsSummaryProps> = ({
  query,
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

  const rows = draftSkillRows(query.planSkills ?? [], excludedIds);
  const excluded = rows
    .filter((row) => row.excluded === true)
    .map((row) => row.skill);
  const lines: string[] = [];
  if (savedExcluded == null) {
    if (excluded.length > 0) {
      lines.push(
        t("agentic.plan.skillsExcludedList", { names: names(excluded) })
      );
    }
  } else {
    const savedIds = new Set(savedExcluded.map((skill) => skill.id));
    const excludedIdSet = new Set(excluded.map((skill) => skill.id));
    const groups: [string, EntityRef[]][] = [
      [
        "agentic.plan.skillsNewlyExcluded",
        excluded.filter((skill) => !savedIds.has(skill.id)),
      ],
      [
        "agentic.plan.skillsNoLongerExcluded",
        savedExcluded.filter((skill) => !excludedIdSet.has(skill.id)),
      ],
      [
        "agentic.plan.skillsStillExcluded",
        excluded.filter((skill) => savedIds.has(skill.id)),
      ],
    ];
    for (const [key, skills] of groups) {
      if (skills.length > 0) {
        lines.push(t(key, { names: names(skills) }));
      }
    }
  }

  const { used } = skillRowCounts(rows);
  return (
    <Stack>
      <StackItem>
        {rows.length === 0 ? (
          <EmptyTextMessage message={t("terms.none")} />
        ) : used === rows.length ? (
          t("agentic.plan.reviewSkillsCount", { count: rows.length })
        ) : (
          t("agentic.plan.reviewSkillsUsed", { used, count: rows.length })
        )}
      </StackItem>
      {lines.map((line) => (
        <StackItem key={line}>
          <Content component="small" className={textStyles.textColorSubtle}>
            {line}
          </Content>
        </StackItem>
      ))}
    </Stack>
  );
};
