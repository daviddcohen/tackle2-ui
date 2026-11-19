import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { isAgenticEnabled } from "@app/Constants";
import { DevPaths } from "@app/Paths";
import { Archetype } from "@app/api/models";
import { useHasSomeScopes } from "@app/auth";
import { DrawerTabContent } from "@app/components/detail-drawer";
import { LabelsFromItems } from "@app/components/labels/labels-from-items/labels-from-items";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import { archetypesWriteScopes } from "@app/scopes";

import { useTargetProfilePlans } from "../hooks/useTargetProfilePlans";

import { AssignedMigrationPlan } from "./assigned-migration-plan";

export interface TabTargetProfilesProps {
  archetype: Archetype;
}

/**
 * Each target profile with the migration plan assigned to it.
 * Generators and the analysis profile stay on the full page (3.4); without
 * the agentic API the tab keeps those upstream columns.
 */
export const TabTargetProfiles: React.FC<TabTargetProfilesProps> = ({
  archetype,
}) => {
  const { t } = useTranslation();
  const canManage = useHasSomeScopes(archetypesWriteScopes);
  const { to } = useEntityBreadcrumbs(archetype.name, [
    { title: t("sidebar.archetypes"), path: DevPaths.archetypes },
  ]);
  const ManageLink = useLinkComponent(to(targetProfilesPath(archetype.id)));
  const { getAssignedPlan, isLoading, isError } = useTargetProfilePlans(
    isAgenticEnabled ? archetype.id : undefined
  );
  const profiles = archetype.profiles ?? [];

  const manageButton = canManage ? (
    <Button
      variant="link"
      isInline
      component={ManageLink}
      className={textStyles.textNowrap}
    >
      {t("actions.manageTargetProfiles")}
    </Button>
  ) : null;

  if (profiles.length === 0) {
    return (
      <DrawerTabContent>
        <EmptyState
          headingLevel="h3"
          titleText={t("agentic.archetype.noTargetProfilesTitle")}
          variant="sm"
        >
          <EmptyStateBody>
            {!canManage
              ? t("agentic.archetype.noTargetProfilesBodyReadOnly")
              : isAgenticEnabled
                ? t("agentic.archetype.noTargetProfilesBody")
                : t("agentic.archetype.noTargetProfilesBodyWithoutPlans")}
          </EmptyStateBody>
          {canManage && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" component={ManageLink}>
                  {t("actions.manageTargetProfiles")}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      </DrawerTabContent>
    );
  }

  return (
    <DrawerTabContent>
      <Stack hasGutter className={spacing.mtMd}>
        {(isAgenticEnabled || manageButton) && (
          <StackItem>
            <Split hasGutter>
              <SplitItem isFilled>
                {isAgenticEnabled && (
                  <Content component="p" className={textStyles.textColorSubtle}>
                    {t("agentic.archetype.targetProfilesTabDescription")}
                  </Content>
                )}
              </SplitItem>
              {manageButton && <SplitItem>{manageButton}</SplitItem>}
            </Split>
          </StackItem>
        )}
        <StackItem>
          <Table aria-label={t("terms.targetProfiles")} variant="compact">
            <Thead>
              <Tr>
                {isAgenticEnabled ? (
                  <>
                    <Th width={50}>{t("terms.targetProfile")}</Th>
                    <Th>{t("agentic.entity.migrationPlan")}</Th>
                  </>
                ) : (
                  <>
                    <Th>{t("terms.name")}</Th>
                    <Th>{t("terms.generators")}</Th>
                    <Th>{t("terms.analysisProfile")}</Th>
                  </>
                )}
              </Tr>
            </Thead>
            <Tbody>
              {profiles.map((profile) => (
                <Tr key={profile.id}>
                  <Td
                    dataLabel={
                      isAgenticEnabled
                        ? t("terms.targetProfile")
                        : t("terms.name")
                    }
                  >
                    <Link to={to(targetProfilePath(archetype.id, profile.id))}>
                      {profile.name}
                    </Link>
                  </Td>
                  {isAgenticEnabled ? (
                    <Td dataLabel={t("agentic.entity.migrationPlan")}>
                      <AssignedMigrationPlan
                        plan={getAssignedPlan(profile.id)}
                        isLoading={isLoading}
                        isError={isError}
                        linkTo={(pathname) => to(pathname)}
                      />
                    </Td>
                  ) : (
                    <>
                      <Td dataLabel={t("terms.generators")}>
                        <LabelsFromItems items={profile.generators} />
                      </Td>
                      <Td dataLabel={t("terms.analysisProfile")}>
                        {profile.analysisProfile?.name ?? "-"}
                      </Td>
                    </>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </StackItem>
      </Stack>
    </DrawerTabContent>
  );
};
