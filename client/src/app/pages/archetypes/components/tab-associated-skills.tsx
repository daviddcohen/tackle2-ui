import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Content, EmptyState, EmptyStateBody } from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { useFetchSkills } from "@app/queries/agentic";

export const TabAssociatedSkills: React.FC<{ archetype: Archetype }> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("terms.archetypes"), path: DevPaths.archetypes },
  ]);
  const { skills, isLoading } = useFetchSkills();
  if (isLoading) {
    return (
      <DrawerTabContent>
        <AppPlaceholder />
      </DrawerTabContent>
    );
  }
  const associatedSkills = skills.filter((skill) =>
    skill.associations?.some(
      (association) =>
        association.scope === "archetype" &&
        association.resource.id === archetype.id
    )
  );
  return (
    <DrawerTabContent>
      {associatedSkills.length ? (
        <Content component="ul">
          {associatedSkills.map((skill) => (
            <Content component="li" key={skill.id}>
              <Link
                to={to(
                  generatePath(DevPaths.skillDetails, {
                    skillId: String(skill.id),
                  })
                )}
              >
                {skill.name}
              </Link>
              <Content component="p">{skill.description}</Content>
            </Content>
          ))}
        </Content>
      ) : (
        <EmptyState
          headingLevel="h3"
          icon={CubesIcon}
          titleText={t("agentic.skill.noArchetypeSkills")}
          variant="sm"
        >
          <EmptyStateBody>
            {t("agentic.skill.noArchetypeSkillsDescription")}
          </EmptyStateBody>
        </EmptyState>
      )}
    </DrawerTabContent>
  );
};
