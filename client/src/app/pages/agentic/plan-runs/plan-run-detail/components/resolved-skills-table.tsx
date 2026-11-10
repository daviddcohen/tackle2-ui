import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Label } from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { EffectiveSkillAssociation, EntityId } from "@app/agentic";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

interface ResolvedSkillsTableProps {
  skills: EffectiveSkillAssociation[];
  runId: EntityId;
  runChildCrumbs: BreadcrumbEntry[];
}

const scopeColor: Record<
  EffectiveSkillAssociation["scope"],
  "blue" | "green" | "orange" | "teal"
> = {
  agent: "blue",
  archetype: "green",
  targetProfile: "orange",
  application: "teal",
};

export const ResolvedSkillsTable: React.FC<ResolvedSkillsTableProps> = ({
  skills,
  runId,
  runChildCrumbs,
}) => {
  const { t } = useTranslation();
  return (
    <Table
      aria-label={t("agentic.planRun.resolvedSkillsTable")}
      variant="compact"
    >
      <Thead>
        <Tr>
          <Th width={40}>{t("terms.name")}</Th>
          <Th width={25}>{t("agentic.plan.skillScopes.scope")}</Th>
          <Th width={35}>{t("agentic.plan.skillScopes.scopeName")}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {skills.map((association, idx) => (
          <Tr key={`${association.skill.id}-${association.scope}-${idx}`}>
            <Td dataLabel={t("terms.name")}>
              <Link
                to={breadcrumbTo(
                  generatePath(DevPaths.skillDetails, {
                    skillId: String(association.skill.id),
                  }),
                  `?from=run-${runId}`,
                  runChildCrumbs
                )}
              >
                {association.skill.name}
              </Link>
            </Td>
            <Td dataLabel={t("agentic.plan.skillScopes.scope")}>
              <Label color={scopeColor[association.scope]} isCompact>
                {t(`agentic.plan.skillScopes.${association.scope}`)}
              </Label>
            </Td>
            <Td dataLabel={t("agentic.plan.skillScopes.scopeName")}>
              {association.scopeName}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};
