import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  Label,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { HubSkillAssociation } from "@app/agentic";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { StateError } from "@app/components/StateError";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { archetypePath } from "@app/pages/agentic/entity-paths";
import { useFetchSkills } from "@app/queries/agentic";

interface SkillsTabProps {
  linkCrumbs: BreadcrumbEntry[];
  applicationId: number;
  archetypes: Ref[];
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  applicationId,
  linkCrumbs,
  archetypes,
}) => {
  const { t } = useTranslation();
  const { skills, isLoading, fetchError } = useFetchSkills();

  const archetypeIds = React.useMemo(
    () => new Set(archetypes.map((a) => a.id)),
    [archetypes]
  );

  const directSkills = React.useMemo(
    () =>
      skills.filter((skill) =>
        (skill.associations ?? []).some(
          (a) => a.scope === "application" && a.resource.id === applicationId
        )
      ),
    [skills, applicationId]
  );

  const archetypeSkills = React.useMemo(
    () =>
      skills.filter((skill) =>
        (skill.associations ?? []).some(
          (a) => a.scope === "archetype" && archetypeIds.has(a.resource.id)
        )
      ),
    [skills, archetypeIds]
  );

  const hasAnySkills = directSkills.length > 0 || archetypeSkills.length > 0;

  if (isLoading) {
    return <AppPlaceholder />;
  }

  if (fetchError != null) {
    return <StateError />;
  }

  if (!hasAnySkills) {
    return (
      <EmptyState
        headingLevel="h3"
        icon={CubesIcon}
        titleText={t("agentic.applicationDetail.skillsEmptyTitle")}
        variant="sm"
      >
        <EmptyStateBody>
          {t("agentic.applicationDetail.skillsEmptyDescription")}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Stack hasGutter>
      {directSkills.length > 0 && (
        <StackItem>
          <Content component="h3">
            {t("agentic.applicationDetail.directSkills")}
          </Content>
          <Content component="p">
            {t("agentic.applicationDetail.directSkillsHelp")}
          </Content>
          <Table
            aria-label={t("agentic.applicationDetail.directSkills")}
            variant="compact"
          >
            <Thead>
              <Tr>
                <Th>{t("terms.name")}</Th>
                <Th modifier="wrap">{t("agentic.skill.sourceType")}</Th>
                <Th>{t("terms.description")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {directSkills.map((skill) => (
                <Tr key={skill.id}>
                  <Td dataLabel={t("terms.name")}>
                    <Link
                      to={breadcrumbTo(
                        generatePath(DevPaths.skillDetails, {
                          skillId: String(skill.id),
                        }),
                        "",
                        linkCrumbs
                      )}
                    >
                      {skill.name}
                    </Link>
                  </Td>
                  <Td dataLabel={t("agentic.skill.sourceType")}>
                    <Label
                      isCompact
                      color={
                        skill.sourceType === "inline"
                          ? "blue"
                          : skill.sourceType === "git"
                            ? "green"
                            : "orange"
                      }
                    >
                      {t(`agentic.skill.sourceTypes.${skill.sourceType}`)}
                    </Label>
                  </Td>
                  <Td dataLabel={t("terms.description")}>
                    {skill.description || "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </StackItem>
      )}

      {archetypeSkills.length > 0 && (
        <StackItem>
          <Content component="h3">
            {t("agentic.applicationDetail.archetypeSkills")}
          </Content>
          <Content component="p">
            {t("agentic.applicationDetail.archetypeSkillsHelp")}
          </Content>
          <Table
            aria-label={t("agentic.applicationDetail.archetypeSkills")}
            variant="compact"
          >
            <Thead>
              <Tr>
                <Th>{t("terms.name")}</Th>
                <Th>{t("agentic.applicationDetail.archetypeColumn")}</Th>
                <Th>{t("terms.description")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {archetypeSkills.map((skill) => {
                const matchingAssoc = (skill.associations ?? []).find(
                  (a): a is HubSkillAssociation =>
                    a.scope === "archetype" && archetypeIds.has(a.resource.id)
                );
                return (
                  <Tr key={skill.id}>
                    <Td dataLabel={t("terms.name")}>
                      <Link
                        to={breadcrumbTo(
                          generatePath(DevPaths.skillDetails, {
                            skillId: String(skill.id),
                          }),
                          "",
                          linkCrumbs
                        )}
                      >
                        {skill.name}
                      </Link>
                    </Td>
                    <Td
                      dataLabel={t("agentic.applicationDetail.archetypeColumn")}
                    >
                      {matchingAssoc ? (
                        <Link
                          to={breadcrumbTo(
                            archetypePath(matchingAssoc.resource.id),
                            "",
                            linkCrumbs
                          )}
                        >
                          {matchingAssoc.resource.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td dataLabel={t("terms.description")}>
                      {skill.description || "—"}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </StackItem>
      )}
    </Stack>
  );
};
