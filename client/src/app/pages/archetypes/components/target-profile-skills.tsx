import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Button,
  Content,
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

export interface TargetProfileSkillsProps {
  profile: TargetProfile;
  /** Skills associated with this profile. */
  skills: Skill[];
  isError: boolean;
  linkTo: (pathname: string) => LocationDescriptor;
}

/**
 * The skills of a target profile in a table cell (guide 7.7, 4.10): none is
 * "None", one is its name as a link, several are "{n} skills" opening a
 * Popover of links, because a target profile has no page of its own.
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
    <Link
      to={linkTo(
        generatePath(DevPaths.skillDetails, { skillId: String(skill.id) })
      )}
    >
      {skill.name}
    </Link>
  );
  if (skills.length === 1) return skillLink(skills[0]);

  return (
    <Popover
      headerContent={t("agentic.archetype.profileSkillsTitle", {
        profile: profile.name,
      })}
      bodyContent={
        <Stack hasGutter>
          <StackItem>
            <List isPlain>
              {skills.map((skill) => (
                <ListItem key={skill.id}>{skillLink(skill)}</ListItem>
              ))}
            </List>
          </StackItem>
          <StackItem>
            <Content component="small" className={textStyles.textColorSubtle}>
              {t("agentic.archetype.profileSkillsDescription")}
            </Content>
          </StackItem>
        </Stack>
      }
    >
      <Button
        variant="link"
        isInline
        id={`target-profile-${profile.id}-skills`}
        className={textStyles.textNowrap}
      >
        {t("agentic.archetype.skillCount", { count: skills.length })}
      </Button>
    </Popover>
  );
};
