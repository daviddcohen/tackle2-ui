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
  ResolvePlanSkillsRequest,
} from "@app/agentic";
import { StageSkillsTable } from "@app/pages/agentic/components/stage-skills-table";
import {
  isResolveEndpointMissing,
  useResolvePlanSkills,
} from "@app/queries/agentic";

import { StartGroup } from "./start-groups";

/**
 * The dialog's tables name their toggles by `simple-node{n}` (PF): each
 * table gets its own range, after the plan page (0, 100), Review (200) and
 * the wizard (300).
 */
const ROW_INDEX_OFFSET = 400;
const ROW_INDEX_STEP = 100;

export interface RunSkillsPreviewProps {
  /** The runs Run starts (`groupReadyApplicationsByPlan`), in order. */
  groups: StartGroup[];
  /** The migration views the dialog holds, for an application on its own plan. */
  migrations: Record<number, ApplicationMigrationView | undefined>;
  /** "Use one migration plan for all applications" without a plan picked yet. */
  isPlanMissing: boolean;
  /** The plans list (stages for the resolver) is still loading. */
  isLoadingPlans: boolean;
  /** Opened to run a failed run again: the new run resolves the skills afresh. */
  isRerun: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}

/**
 * "Skills by stage" in the Run migration plan dialog:
 * what each stage's agent gets in each plan run Run starts, built
 * from the same groups as the start request. Collapsed until asked for,
 * and every group in it starts collapsed. Names are plain text: a link
 * would close the dialog and lose its choices. Loading and errors never
 * block Run.
 */
export const RunSkillsPreview: React.FC<RunSkillsPreviewProps> = ({
  groups,
  migrations,
  isPlanMissing,
  isLoadingPlans,
  isRerun,
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
    isRerun ? t("agentic.execution.previewRerun") : null,
    // Said once, whenever more than one application is covered.
    applicationCount > 1
      ? t("agentic.stageSkills.everyStagePerApplication")
      : null,
  ].filter((sentence): sentence is string => sentence != null);

  return (
    <ExpandableSection
      toggleId="migration-preflight-skills-toggle"
      contentId="migration-preflight-skills"
      toggleText={t("agentic.stageSkills.title")}
      isExpanded={isExpanded}
      onToggle={(_event, expanded) => onExpandedChange(expanded)}
      isIndented
    >
      {isExpanded && (
        <Stack hasGutter>
          {isPlanMissing ? (
            <StackItem>
              <Content component="p">
                {t("agentic.execution.previewSelectPlan")}
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
                    migrations={migrations}
                    isSeveral={isSeveral}
                    isLoadingPlans={isLoadingPlans}
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
 * One plan run's table. One application on its own plan reads the skills
 * its migration view already has; any other group asks the resolver for
 * the plan's stages and these applications.
 */
const RunGroupPreview: React.FC<{
  group: StartGroup;
  migrations: RunSkillsPreviewProps["migrations"];
  isSeveral: boolean;
  isLoadingPlans: boolean;
  rowIndexOffset: number;
}> = ({ group, migrations, isSeveral, isLoadingPlans, rowIndexOffset }) => {
  const { t } = useTranslation();
  const only =
    group.applications.length === 1
      ? migrations[group.applications[0].id]
      : undefined;
  const ownSkills = only?.plan?.id === group.plan.id ? only.skills : undefined;

  // The groups are rebuilt on every render of the dialog: the request
  // depends on the plan and the application ids only.
  const { migrationPlan } = group;
  const applicationIds = group.applications
    .map((application) => application.id)
    .join(",");
  const request = React.useMemo<ResolvePlanSkillsRequest | undefined>(
    () =>
      ownSkills != null || migrationPlan == null
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
            applications: applicationIds
              .split(",")
              .map((id) => ({ id: Number(id) })),
          },
    [ownSkills, migrationPlan, applicationIds]
  );
  const { skillsByStage, isFetching, fetchError, refetch } =
    useResolvePlanSkills(request);

  const isMissing = fetchError != null && isResolveEndpointMissing(fetchError);
  const skills = ownSkills ?? (isMissing ? undefined : skillsByStage);
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
    ownSkills == null && migrationPlan == null && !isLoadingPlans;
  const isError =
    isPlanGone ||
    (ownSkills == null && fetchError != null && !isMissing && !isLoading);

  const title = t("agentic.execution.previewRunTitle", {
    plan: group.plan.name,
    count: group.applications.length,
  });
  const table = (
    <StageSkillsTable
      skills={skills}
      context="run"
      defaultExpanded="none"
      groupHeadingLevel={isSeveral ? "h3" : "h2"}
      rowIndexOffset={rowIndexOffset}
      // A target profile of the plan's own archetype needs no archetype name.
      originOptions={{
        archetypeId: group.migrationPlan?.migrationPath?.archetype.id,
      }}
      unavailableText={t("agentic.execution.previewSkillsUnavailable")}
      aria-label={
        isSeveral
          ? t("agentic.execution.previewTableLabel", { plan: group.plan.name })
          : t("agentic.stageSkills.title")
      }
      isLoading={isLoading}
      isError={isError}
      errorBody={t("agentic.execution.previewRunAnyway")}
      onRetry={isPlanGone ? undefined : () => void refetch()}
    />
  );
  if (!isSeveral) return table;
  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h2" size="md">
          {title}
        </Title>
      </StackItem>
      <StackItem>{table}</StackItem>
    </Stack>
  );
};
