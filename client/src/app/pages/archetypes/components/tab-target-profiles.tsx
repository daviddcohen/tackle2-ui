import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bullseye, EmptyState, EmptyStateBody } from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { LabelsFromItems } from "@app/components/labels/labels-from-items/labels-from-items";
import { targetProfilePath } from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";

export interface TabTargetProfilesProps {
  archetype: Archetype;
}

export const TabTargetProfiles: React.FC<TabTargetProfilesProps> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("terms.archetypes"), path: DevPaths.archetypes },
  ]);
  const profiles = archetype?.profiles || [];

  if (profiles.length === 0) {
    return (
      <Bullseye>
        <EmptyState
          headingLevel="h4"
          icon={CubesIcon}
          titleText={t("message.noTargetProfilesTitle")}
        >
          <EmptyStateBody>
            {t("message.noTargetProfilesDescription")}
          </EmptyStateBody>
        </EmptyState>
      </Bullseye>
    );
  }

  return (
    <DrawerTabContent>
      <Table
        aria-label="Target profiles"
        className={spacing.mtMd}
        variant="compact"
      >
        <Thead>
          <Tr>
            <Th>{t("terms.name")}</Th>
            <Th>{t("terms.generators")}</Th>
            <Th>{t("terms.analysisProfile")}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {profiles.map((profile) => (
            <Tr key={profile.id}>
              <Td width={25}>
                <Link to={to(targetProfilePath(archetype.id, profile.id))}>
                  {profile.name}
                </Link>
              </Td>
              <Td width={40}>
                <LabelsFromItems items={profile.generators} />
              </Td>
              <Td width={35}>{profile.analysisProfile?.name ?? "-"}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </DrawerTabContent>
  );
};
