import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Content,
  Flex,
  FlexItem,
  Label,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";

import {
  ApplicationMigrationView,
  getMigrationDisplayStatus,
} from "@app/agentic";

interface MigrationPortfolioOverviewProps {
  migrations: ApplicationMigrationView[];
  onReviewAttention: () => void;
}

export const MigrationPortfolioOverview: React.FC<
  MigrationPortfolioOverviewProps
> = ({ migrations, onReviewAttention }) => {
  const { t } = useTranslation();
  const counts = migrations.reduce(
    (current, migration) => {
      const status = getMigrationDisplayStatus(migration);
      if (status === "succeeded") current.succeeded += 1;
      else if (status === "pending") current.pending += 1;
      else if (status === "running") current.running += 1;
      else if (status === "actionRequired") current.actionRequired += 1;
      else if (status === "failed") current.failed += 1;
      return current;
    },
    { succeeded: 0, pending: 0, running: 0, actionRequired: 0, failed: 0 }
  );

  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h2" size="lg">
          {t("agentic.execution.portfolio.title")}
        </Title>
        <Content component="p">
          {t("agentic.execution.portfolio.currentWorkDescription")}
        </Content>
      </StackItem>
      <StackItem>
        <Flex
          alignItems={{ default: "alignItemsCenter" }}
          spaceItems={{ default: "spaceItemsMd" }}
        >
          {counts.succeeded > 0 && (
            <FlexItem>
              <Label color="green" isCompact>
                {t("agentic.execution.displayStatus.succeeded")}:{" "}
                {counts.succeeded}
              </Label>
            </FlexItem>
          )}
          {(["pending", "running", "failed"] as const).map((status) => (
            <FlexItem key={status}>
              <Label color={status === "failed" ? "red" : "blue"} isCompact>
                {t(`agentic.execution.displayStatus.${status}`)}:{" "}
                {counts[status]}
              </Label>
            </FlexItem>
          ))}
          <FlexItem>
            {counts.actionRequired > 0 ? (
              <Button variant="link" isInline onClick={onReviewAttention}>
                {t("agentic.execution.portfolio.reviewRequests", {
                  count: counts.actionRequired,
                })}
              </Button>
            ) : (
              <Label color="grey" isCompact>
                {t("agentic.execution.displayStatus.actionRequired")}: 0
              </Label>
            )}
          </FlexItem>
        </Flex>
      </StackItem>
    </Stack>
  );
};
