import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Alert,
  AlertActionLink,
  Checkbox,
  Content,
  Flex,
  FlexItem,
  Label,
  Skeleton,
  Title,
  Tooltip,
} from "@patternfly/react-core";
import a11yStyles from "@patternfly/react-styles/css/utilities/Accessibility/accessibility";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  EntityId,
  EntityRef,
  EveryStageSkillsGroup,
  SkillsByStage,
  StageSkill,
  StageSkillsGroup,
} from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { applicationSkillsPath } from "@app/pages/agentic/entity-paths";
import { universalComparator } from "@app/utils/utils";

import { SectionEmpty } from "./detail-section";
import {
  SkillLinkTo,
  SkillOriginList,
  SkillOriginOptions,
  linkToPath,
} from "./skill-origin";

/**
 * A plan run with more applications than this starts with its "Every
 * stage" groups collapsed (`defaultExpanded="stages"`); the stage groups
 * stay open.
 */
export const EVERY_STAGE_COLLAPSE_AFTER = 3;

export interface StageSkillsTableProps {
  /**
   * What each stage gets, rendered as given: every row the
   * data has, a skill that reaches several groups in each of them.
   * Undefined when the server does not report it: "Unavailable".
   */
  skills: SkillsByStage | undefined;
  /**
   * Picks the group titles: "run" names each Every stage group's
   * application ("Every stage: {application}") and, with links, reads its
   * own skills as "This application"; "plan" and "application" say "Every
   * stage".
   */
  context: "plan" | "run" | "application";
  /**
   * Stage page: only this stage's group (by `StageSkillsGroup.stageId`) and
   * this application's Every stage group. A key left out does not filter.
   */
  filter?: { stageId?: EntityId; applicationId?: number };
  /**
   * Builds links with the caller's breadcrumb trail. Called with a
   * pathname and a search that may hold a query and a hash (archetype
   * drawer tab, target profile anchor). Absent: names are plain text
   * (wizard, dialogs).
   */
  linkTo?: SkillLinkTo;
  /**
   * A checkbox per row, checked unless the row is excluded (plan wizard, Run
   * migration plan dialog).
   */
  include?: {
    onChange: (skill: EntityRef, included: boolean) => void;
    isDisabled?: boolean;
    /**
     * Rows whose checkbox cannot change. Default (plan wizard): a skill
     * attached to the application itself, which a plan cannot exclude.
     */
    isLocked?: (entry: StageSkill) => boolean;
    /**
     * The checkbox's accessible name. Default (plan wizard): "Include
     * {skill} in stage {n}" or "in every stage", the group it sits in.
     */
    label?: (skill: EntityRef) => string;
  };
  /**
   * The label of an excluded row (undefined: "Excluded"), for example who
   * excluded it, with an optional tooltip that says why or what to do. The
   * label and tooltip also describe a locked row's checkbox.
   */
  excludedLabel?: (
    entry: StageSkill
  ) => { text: string; tooltip?: string } | undefined;
  /** "all" (default), "none" (every group collapsed), "stages" (stage groups only). */
  defaultExpanded?: "all" | "none" | "stages";
  /** "h3" under an h2 section (default); "h2" in the wizard and the dialog. */
  groupHeadingLevel?: "h2" | "h3";
  /** For the From values (`formatSkillOrigin`). */
  originOptions?: SkillOriginOptions;
  /**
   * Added to the row indexes PF names the toggles by (`simple-node{n}`):
   * each `Td expand` table on one page needs its own range.
   */
  rowIndexOffset?: number;
  /** The sentence after "Unavailable" when `skills` is undefined. */
  unavailableText?: string;
  /**
   * The error alert's body under its title (the Run dialog's "You can still
   * run the migration plan.").
   */
  errorBody?: React.ReactNode;
  /** Id prefix of the table, its toggles and checkboxes. */
  id?: string;
  "aria-label": string;
  isLoading?: boolean;
  /** The query failed: an inline alert, with "Try again" when `onRetry` is given. */
  isError?: boolean;
  onRetry?: () => void;
}

type Group =
  | { kind: "stage"; key: string; group: StageSkillsGroup }
  | { kind: "everyStage"; key: string; group: EveryStageSkillsGroup };

/** A plan cannot exclude a skill attached to the application itself. */
export const isAttachedToApplication = ({ from }: StageSkill) =>
  from.some((origin) => origin.kind === "application");

const sortedSkills = (skills: StageSkill[]) =>
  [...skills].sort((a, b) => universalComparator(a.skill.name, b.skill.name));

/**
 * "Skills by stage" (`unavailableText` and `errorBody` carry the error
 * sentences; every "Every stage" title carries the same subtle subtitle in
 * every context, and the longer notes live in the caller's section
 * description):
 * what each stage's agent gets and where each skill comes from. One
 * compact table, one `Tbody` per group: the
 * stages in order, then the "Every stage" group or groups. A group's first
 * row holds the expand toggle and the group title (a heading, which also
 * names the toggle "{title} Details" through PF's `simple-node{n}`), and,
 * while collapsed, how many skills it has. Its skill rows line up with the
 * header: [Include] · Skill · From · How agents use it. An excluded skill
 * shows the outline "Excluded" label (or `excludedLabel`) in the last
 * column.
 */
export const StageSkillsTable: React.FC<StageSkillsTableProps> = ({
  skills,
  context,
  filter,
  linkTo,
  include,
  excludedLabel,
  defaultExpanded = "all",
  groupHeadingLevel = "h3",
  originOptions,
  rowIndexOffset = 0,
  unavailableText,
  errorBody,
  id: idProp,
  "aria-label": ariaLabel,
  isLoading,
  isError,
  onRetry,
}) => {
  const { t } = useTranslation();
  const generatedId = `stage-skills-${React.useId().replace(/:/g, "")}`;
  const id = idProp ?? generatedId;
  // Only the groups the user toggled; the others follow `defaultExpanded`.
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});

  const columns = {
    include: t("agentic.stageSkills.include"),
    skill: t("agentic.stageSkills.skill"),
    from: t("agentic.stageSkills.from"),
    loadPolicy: t("agentic.skill.loadPolicy.label"),
  };
  const columnCount = include != null ? 5 : 4;

  if (isError) {
    return (
      <Alert
        variant="danger"
        isInline
        isPlain
        title={t("agentic.plan.skillsLoadFailed")}
        actionLinks={
          onRetry != null ? (
            <AlertActionLink onClick={onRetry}>
              {t("agentic.plan.retrySkills")}
            </AlertActionLink>
          ) : undefined
        }
      >
        {errorBody}
      </Alert>
    );
  }
  if (!isLoading && skills == null) {
    return (
      <Flex
        direction={{ default: "column" }}
        spaceItems={{ default: "spaceItemsXs" }}
      >
        <FlexItem>
          <EmptyTextMessage message={t("agentic.common.unavailable")} />
        </FlexItem>
        {unavailableText != null && (
          <FlexItem>
            <Content component="p">{unavailableText}</Content>
          </FlexItem>
        )}
      </Flex>
    );
  }

  const groups: Group[] =
    skills == null
      ? []
      : [
          ...[...skills.stages]
            .filter(
              (stage) =>
                filter?.stageId == null || stage.stageId === filter.stageId
            )
            .sort((a, b) => a.order - b.order)
            .map(
              (group): Group => ({
                kind: "stage",
                key: `stage-${group.order}`,
                group,
              })
            ),
          ...skills.everyStage
            .filter(
              (group) =>
                filter?.applicationId == null ||
                group.application?.id === filter.applicationId
            )
            .map(
              (group, index): Group => ({
                kind: "everyStage",
                key: `every-stage-${group.application?.id ?? `plan-${index}`}`,
                group,
              })
            ),
        ];

  // A plan draft without stages: the resolver still answers its (empty)
  // Every stage group, so this looks at the stages, not at every group.
  if (
    !isLoading &&
    skills != null &&
    filter?.stageId == null &&
    skills.stages.length === 0
  ) {
    return <SectionEmpty>{t("agentic.stageSkills.noStages")}</SectionEmpty>;
  }
  if (!isLoading && groups.length === 0) {
    // A stage or application the data does not cover.
    return filter == null ? (
      <SectionEmpty>{t("agentic.stageSkills.noStages")}</SectionEmpty>
    ) : (
      <EmptyTextMessage message={t("agentic.stageSkills.noSkills")} />
    );
  }

  const isDefaultOpen = (group: Group) =>
    defaultExpanded === "all" ||
    (defaultExpanded === "stages" && group.kind === "stage");
  const isOpen = (group: Group) => toggled[group.key] ?? isDefaultOpen(group);

  const link = (path: string, text: string) =>
    linkTo != null ? <Link to={linkToPath(linkTo, path)}>{text}</Link> : text;
  const tagLink = (path: string) =>
    linkTo != null ? <Link to={linkToPath(linkTo, path)} /> : <span />;

  const groupTitle = (group: Group) => {
    if (group.kind === "stage") {
      // A wizard draft's stage may have no name yet: "Stage {n}".
      return group.group.name.trim() !== ""
        ? t("agentic.plan.stageTitle", {
            number: group.group.order,
            stage: group.group.name,
          })
        : t("agentic.plan.stageNumber", { number: group.group.order });
    }
    const application = group.group.application;
    if (context === "run" && application != null) {
      return (
        <Trans
          i18nKey="agentic.stageSkills.everyStageApplication"
          values={{ application: application.name }}
          components={{
            applicationLink: tagLink(applicationSkillsPath(application.id)),
          }}
        />
      );
    }
    return t("agentic.stageSkills.everyStage");
  };

  const summary = (skillsOfGroup: StageSkill[]) => {
    const count = t("agentic.stageSkills.summary", {
      count: skillsOfGroup.length,
    });
    const excluded = skillsOfGroup.filter((skill) => skill.excluded).length;
    return excluded > 0
      ? t("agentic.stageSkills.summaryExcluded", { skills: count, excluded })
      : count;
  };

  const subtle = (content: React.ReactNode) => (
    <Content component="small" className={textStyles.textColorSubtle}>
      {content}
    </Content>
  );

  const includeLabel = (group: Group, skill: EntityRef) =>
    include?.label != null
      ? include.label(skill)
      : group.kind === "stage"
        ? t("agentic.stageSkills.includeInStage", {
            skill: skill.name,
            number: group.group.order,
          })
        : t("agentic.stageSkills.includeInEveryStage", { skill: skill.name });

  // A run page's Every stage group names its application in its title, so
  // its own skills read "This application", as on the Migration tab.
  // Without links (Run dialog) the name stays: it helps
  // there.
  const rowOriginOptions = (group: Group): SkillOriginOptions | undefined =>
    context === "run" &&
    linkTo != null &&
    group.kind === "everyStage" &&
    group.group.application != null
      ? { ...originOptions, thisApplicationId: group.group.application.id }
      : originOptions;

  const skillRow = (group: Group, entry: StageSkill, isExpanded: boolean) => {
    const { skill, loadPolicy, excluded, from } = entry;
    const isLocked = (include?.isLocked ?? isAttachedToApplication)(entry);
    const excludedLabelId = `${id}-excluded-${group.key}-${skill.id}`;
    const tooltipId = `${excludedLabelId}-tooltip`;
    const label = excluded ? excludedLabel?.(entry) : undefined;
    const labelText = label?.text ?? t("agentic.skillsTable.excluded");
    return (
      <Tr key={`${group.key}-${skill.id}`} isExpanded={isExpanded}>
        <Td />
        {include != null && (
          <Td dataLabel={columns.include} modifier="fitContent">
            <Checkbox
              id={`${id}-include-${group.key}-${skill.id}`}
              aria-label={includeLabel(group, skill)}
              aria-describedby={
                isLocked && excluded
                  ? [excludedLabelId, label?.tooltip != null ? tooltipId : null]
                      .filter((ref) => ref != null)
                      .join(" ")
                  : undefined
              }
              isChecked={!excluded}
              isDisabled={include.isDisabled || isLocked}
              onChange={(_event, checked) => include.onChange(skill, checked)}
            />
          </Td>
        )}
        <Td dataLabel={columns.skill}>
          {link(
            generatePath(DevPaths.skillDetails, { skillId: skill.id }),
            skill.name
          )}
        </Td>
        <Td dataLabel={columns.from}>
          <SkillOriginList
            origins={from}
            options={rowOriginOptions(group)}
            linkTo={linkTo}
          />
        </Td>
        <Td dataLabel={columns.loadPolicy} modifier="nowrap">
          {excluded && label?.tooltip != null ? (
            <>
              {/* Focusable so keyboard users reach the tooltip; the hidden
                  copy describes a locked checkbox. */}
              <Tooltip content={label.tooltip}>
                <Label
                  variant="outline"
                  isCompact
                  id={excludedLabelId}
                  tabIndex={0}
                >
                  {labelText}
                </Label>
              </Tooltip>
              <span id={tooltipId} className={a11yStyles.screenReader}>
                {label.tooltip}
              </span>
            </>
          ) : excluded ? (
            <Label variant="outline" isCompact id={excludedLabelId}>
              {labelText}
            </Label>
          ) : (
            t(`agentic.skill.loadPolicy.${loadPolicy}`)
          )}
        </Td>
      </Tr>
    );
  };

  return (
    <Table
      id={id}
      aria-label={ariaLabel}
      variant="compact"
      isExpandable
      // Grid mode does not lay out expandable child rows.
      gridBreakPoint=""
    >
      <Thead>
        <Tr>
          <Th screenReaderText={t("agentic.plan.stageExpansion")} />
          {include != null && <Th modifier="fitContent">{columns.include}</Th>}
          {/* Room for the From values ("Collection: {name}"), which wrap
              first in a narrow dialog. */}
          <Th width={30}>{columns.skill}</Th>
          <Th width={40}>{columns.from}</Th>
          <Th
            modifier="fitContent"
            info={{
              popover: t("agentic.skill.loadPolicy.help"),
              ariaLabel: t("agentic.skill.loadPolicy.helpLabel"),
              popoverProps: {
                headerContent: columns.loadPolicy,
              },
            }}
          >
            {columns.loadPolicy}
          </Th>
        </Tr>
      </Thead>
      {isLoading ? (
        <Tbody>
          <Tr>
            <Td colSpan={columnCount}>
              <Flex
                direction={{ default: "column" }}
                spaceItems={{ default: "spaceItemsSm" }}
              >
                {[0, 1, 2, 3].map((index) => (
                  <FlexItem key={index}>
                    <Skeleton
                      height="1.5rem"
                      screenreaderText={
                        index === 0
                          ? t("agentic.plan.loadingSkillsShort")
                          : undefined
                      }
                    />
                  </FlexItem>
                ))}
              </Flex>
            </Td>
          </Tr>
        </Tbody>
      ) : (
        groups.map((group, index) => {
          const rowIndex = rowIndexOffset + index;
          const isExpanded = isOpen(group);
          const groupSkills = sortedSkills(group.group.skills);
          const runBy =
            group.kind === "stage" ? (
              <Trans
                i18nKey="agentic.stageSkills.runBy"
                values={{ agent: group.group.agent.name }}
                components={{
                  agentLink: tagLink(
                    generatePath(DevPaths.agentDetails, {
                      agentId: group.group.agent.id,
                    })
                  ),
                }}
              />
            ) : null;
          // One look for Every stage everywhere: what
          // the group holds, after its title.
          const leadsIn =
            runBy ??
            (group.kind === "everyStage"
              ? // A plan's Every stage holds no application skills.
                group.group.application != null
                ? t("agentic.stageSkills.everyStageSubtitle")
                : t("agentic.stageSkills.everyStagePlanSubtitle")
              : null);
          return (
            <Tbody key={group.key} isExpanded={isExpanded}>
              <Tr isContentExpanded={isExpanded}>
                <Td
                  expand={{
                    rowIndex,
                    isExpanded,
                    expandId: `${id}-toggle-`,
                    onToggle: () =>
                      setToggled((current) => ({
                        ...current,
                        [group.key]: !isExpanded,
                      })),
                  }}
                />
                <Td colSpan={columnCount - 1}>
                  <Flex
                    spaceItems={{ default: "spaceItemsSm" }}
                    alignItems={{ default: "alignItemsBaseline" }}
                  >
                    <FlexItem>
                      {/* PF names the toggle by `simple-node{rowIndex}`. */}
                      <Title
                        headingLevel={groupHeadingLevel}
                        size="md"
                        id={`simple-node${rowIndex}`}
                      >
                        {groupTitle(group)}
                      </Title>
                    </FlexItem>
                    {leadsIn != null && <FlexItem>{subtle(leadsIn)}</FlexItem>}
                    {!isExpanded && leadsIn != null && (
                      <FlexItem aria-hidden="true">{subtle("·")}</FlexItem>
                    )}
                    {!isExpanded && (
                      <FlexItem>{subtle(summary(groupSkills))}</FlexItem>
                    )}
                  </Flex>
                </Td>
              </Tr>
              {groupSkills.length > 0 ? (
                groupSkills.map((entry) => skillRow(group, entry, isExpanded))
              ) : (
                <Tr isExpanded={isExpanded}>
                  <Td />
                  {include != null && <Td />}
                  <Td colSpan={3}>
                    <EmptyTextMessage
                      message={t("agentic.stageSkills.noSkills")}
                    />
                  </Td>
                </Tr>
              )}
            </Tbody>
          );
        })
      )}
    </Table>
  );
};
