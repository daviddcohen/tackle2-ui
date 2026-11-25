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
  Popover,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import type { Skill } from "@app/agentic";
import type { TargetProfile } from "@app/api/models";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { universalComparator } from "@app/utils/utils";

export interface TargetProfileSkillsProps {
  profile: TargetProfile;
  /** Skills attached to this profile. */
  skills: Skill[];
  isError: boolean;
  linkTo: (pathname: string) => LocationDescriptor;
}

/**
 * The skills attached to a target profile in a table cell:
 * none is "None", one is its name as a link, several are "{n} skills"
 * opening a Popover of links, because a target profile has no page of its
 * own. Rules carry the "Always followed" marker.
 */
export const TargetProfileSkills: React.FC<TargetProfileSkillsProps> = ({
  profile,
  skills,
  isError,
  linkTo,
}) => {
  const { t } = useTranslation();
  if (isError)
    return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  if (skills.length === 0)
    return <EmptyTextMessage message={t("terms.none")} />;

  const skillLink = (skill: Skill) => (
    <Flex
      display={{ default: "inlineFlex" }}
      spaceItems={{ default: "spaceItemsSm" }}
      alignItems={{ default: "alignItemsCenter" }}
      flexWrap={{ default: "nowrap" }}
    >
      <FlexItem>
        <Link
          to={linkTo(
            generatePath(DevPaths.skillDetails, { skillId: String(skill.id) })
          )}
        >
          {skill.name}
        </Link>
      </FlexItem>
      {skill.loadPolicy === "rule" && (
        <FlexItem>
          <Label variant="outline" isCompact>
            {t("agentic.skill.loadPolicy.rule")}
          </Label>
        </FlexItem>
      )}
    </Flex>
  );
  if (skills.length === 1) return skillLink(skills[0]);

  const sorted = [...skills].sort((a, b) =>
    universalComparator(a.name, b.name)
  );
  return (
    <Popover
      headerContent={
        // This is the profile's own page: its name is not a link here.
        <Trans
          i18nKey="agentic.attachedSkills.targetProfile"
          values={{ name: profile.name }}
          components={{ nameLink: <span /> }}
        />
      }
      bodyContent={
        <Stack hasGutter>
          {/* The sentence first, then the list, as in the drawer and on
              the Skills tab. */}
          <StackItem>
            <Content component="small" className={textStyles.textColorSubtle}>
              {t("agentic.skill.scopeSentence.targetProfileStandalone")}
            </Content>
          </StackItem>
          <StackItem>
            <List isPlain>
              {sorted.map((skill) => (
                <ListItem key={skill.id}>{skillLink(skill)}</ListItem>
              ))}
            </List>
          </StackItem>
        </Stack>
      }
    >
      <Button
        variant="link"
        isInline
        id={`target-profile-${profile.id}-skills`}
        aria-label={t("agentic.archetype.profileSkillsButton", {
          count: skills.length,
          profile: profile.name,
        })}
        className={textStyles.textNowrap}
      >
        {t("agentic.archetype.skillCount", { count: skills.length })}
      </Button>
    </Popover>
  );
};
