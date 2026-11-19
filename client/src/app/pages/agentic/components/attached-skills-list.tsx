import * as React from "react";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  Content,
  Flex,
  FlexItem,
  Label,
  List,
  ListItem,
  Skeleton,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import {
  EntityRef,
  Skill,
  SkillAssociationScope,
  SkillLoadPolicy,
} from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { universalComparator } from "@app/utils/utils";

import { DetailSection, DetailSections } from "./detail-section";

/** One skill attached to an owner. */
export interface AttachedSkill {
  skill: EntityRef;
  /** "rule" shows the "Always followed" marker. */
  loadPolicy: SkillLoadPolicy;
}

/** The skills attached to one owner: an application, an archetype or a target profile. */
export interface AttachedSkillsGroup {
  /**
   * Stable key and id stem ("application-3", "archetype-1",
   * "targetProfile-11"): the heading id is `attached-skills-{key}-heading`.
   */
  key: string;
  /**
   * The heading without its count, already translated; may hold the owner's
   * link (a `Trans` of `agentic.attachedSkills.archetype`). The list adds the
   * count when the group has skills.
   */
  heading: React.ReactNode;
  /**
   * The heading as plain text, if the host wants it for the Manage skills
   * name it builds (`manage.ariaLabel`). The list does not read it.
   */
  headingText?: string;
  /** The scope sentence (`agentic.skill.scopeSentence.*`), or nothing. */
  description?: React.ReactNode;
  skills: AttachedSkill[];
  /** The one left-aligned sentence shown when `skills` is empty. */
  emptyText: string;
  /** A link after the empty sentence (Go to archetypes, View target profiles). */
  emptyAction?: { label: string; to: LocationDescriptor };
  /**
   * Only on groups the user can edit: the Manage skills link button on the
   * heading's line. `buttonId` from `manageSkillsButtonId(target)`,
   * `ariaLabel` from `agentic.skill.manageSkills.titleFor`.
   */
  manage?: { onClick: () => void; buttonId: string; ariaLabel: string };
  /** The data behind this group could not be read: "Unavailable", never "none". */
  isUnavailable?: boolean;
  /** The data behind this group is still loading: one skeleton line. */
  isLoading?: boolean;
}

export interface AttachedSkillsListProps {
  /** In display order: the page's own group first, then archetypes by name. */
  groups: AttachedSkillsGroup[];
  /** "h2" on a page tab (default), "h3" under a drawer's own heading. */
  headingLevel?: "h2" | "h3";
  /** A paragraph above the groups. */
  intro?: React.ReactNode;
  /** Builds a skill link with the caller's breadcrumb trail. */
  linkTo: (pathname: string) => LocationDescriptor;
}

export const attachedSkillsHeadingId = (key: string) =>
  `attached-skills-${key}-heading`;

/**
 * The skills attached directly to one owner, from `Skill.associations`
 * (absent `loadPolicy` is the CRD default, "skill").
 */
export const attachedSkillsFor = (
  skills: Skill[],
  scope: SkillAssociationScope,
  id: number | string
): AttachedSkill[] =>
  skills
    .filter((skill) =>
      skill.associations?.some(
        (association) =>
          association.scope === scope &&
          String(association.resource.id) === String(id)
      )
    )
    .map((skill) => ({
      skill: { id: skill.id, name: skill.name },
      loadPolicy: skill.loadPolicy ?? "skill",
    }));

/**
 * The attached view of skills: one section per owner
 * group, with the count in its heading, the scope sentence, and a plain list
 * of skill links with an "Always followed" marker after rules. It never
 * looks like the Skills by stage table. Manage skills sits only on the
 * group it edits. An empty group keeps its heading and says so in one
 * sentence, as Konveyor's drawer shows "None" under an empty tag section.
 */
export const AttachedSkillsList: React.FC<AttachedSkillsListProps> = ({
  groups,
  headingLevel = "h2",
  intro,
  linkTo,
}) => {
  const { t } = useTranslation();
  return (
    <DetailSections>
      {intro != null && <Content component="p">{intro}</Content>}
      {groups.map((group) => {
        const headingId = attachedSkillsHeadingId(group.key);
        const hasCount =
          !group.isLoading && !group.isUnavailable && group.skills.length > 0;
        return (
          <DetailSection
            key={group.key}
            headingId={headingId}
            headingLevel={headingLevel}
            title={
              hasCount ? (
                <Trans
                  i18nKey="agentic.attachedSkills.headingWithCount"
                  values={{ count: group.skills.length }}
                  components={{ heading: <>{group.heading}</> }}
                />
              ) : (
                group.heading
              )
            }
            description={group.description}
            actions={
              group.manage != null ? (
                <Button
                  id={group.manage.buttonId}
                  variant="link"
                  isInline
                  aria-label={group.manage.ariaLabel}
                  onClick={group.manage.onClick}
                >
                  {t("agentic.skill.manageSkills.title")}
                </Button>
              ) : undefined
            }
          >
            <AttachedSkillsGroupBody
              group={group}
              headingId={headingId}
              linkTo={linkTo}
            />
          </DetailSection>
        );
      })}
    </DetailSections>
  );
};

const AttachedSkillsGroupBody: React.FC<{
  group: AttachedSkillsGroup;
  headingId: string;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ group, headingId, linkTo }) => {
  const { t } = useTranslation();
  const EmptyActionLink = useLinkComponent(group.emptyAction?.to);

  if (group.isLoading) {
    return (
      <Skeleton
        width="40%"
        screenreaderText={t("agentic.plan.loadingSkillsShort")}
      />
    );
  }
  if (group.isUnavailable) {
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  }
  if (group.skills.length === 0) {
    return (
      <Content component="p">
        {group.emptyText}
        {group.emptyAction != null && (
          <>
            {" "}
            <Button variant="link" isInline component={EmptyActionLink}>
              {group.emptyAction.label}
            </Button>
          </>
        )}
      </Content>
    );
  }
  const skills = [...group.skills].sort((a, b) =>
    universalComparator(a.skill.name, b.skill.name)
  );
  return (
    <List isPlain aria-labelledby={headingId}>
      {skills.map(({ skill, loadPolicy }) => (
        <ListItem key={skill.id}>
          <Flex
            display={{ default: "inlineFlex" }}
            spaceItems={{ default: "spaceItemsSm" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem>
              <Link
                to={linkTo(
                  generatePath(DevPaths.skillDetails, { skillId: skill.id })
                )}
              >
                {skill.name}
              </Link>
            </FlexItem>
            {loadPolicy === "rule" && (
              <FlexItem>
                <Label variant="outline" isCompact>
                  {t("agentic.skill.loadPolicy.rule")}
                </Label>
              </FlexItem>
            )}
          </Flex>
        </ListItem>
      ))}
    </List>
  );
};
