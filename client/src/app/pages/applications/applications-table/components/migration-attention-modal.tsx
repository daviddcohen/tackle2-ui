import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Content,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  Stack,
  StackItem,
} from "@patternfly/react-core";

import { ApplicationMigrationMap } from "@app/agentic";

import {
  MIGRATION_TAB_SEARCH,
  applicationDetailsPath,
} from "../../components/agentic-migration/paths";
import { DecoratedApplication } from "../../useDecoratedApplications";

interface MigrationAttentionModalProps {
  applications: DecoratedApplication[];
  migrations: ApplicationMigrationMap;
  isOpen: boolean;
  onClose: () => void;
  /** Builds a link that carries the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
}

/**
 * The applications waiting for a decision. Each request is decided on the
 * application's Migration tab, which this dialog opens.
 */
export const MigrationAttentionModal: React.FC<
  MigrationAttentionModalProps
> = ({ applications, migrations, isOpen, onClose, linkTo }) => {
  const { t } = useTranslation();
  const history = useHistory();
  const requests = applications.flatMap((application) => {
    const migration =
      application.id != null ? migrations[application.id] : undefined;
    return application.id != null &&
      migration?.intervention === "actionRequired"
      ? [{ application, applicationId: application.id, migration }]
      : [];
  });

  return (
    <Modal variant="large" isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        title={t("agentic.execution.attention.title")}
        description={t("agentic.execution.attention.description", {
          count: requests.length,
        })}
      />
      <ModalBody>
        {requests.length === 0 ? (
          <Content component="p">
            {t("agentic.execution.attention.empty")}
          </Content>
        ) : (
          <Stack hasGutter>
            {requests.map(({ application, applicationId, migration }) => (
              <StackItem key={applicationId}>
                <Card isCompact>
                  <CardHeader>
                    <CardTitle>{migration.action?.title}</CardTitle>
                    <Label
                      color={
                        migration.action?.risk === "high"
                          ? "red"
                          : migration.action?.risk === "medium"
                            ? "orange"
                            : "blue"
                      }
                      isCompact
                    >
                      {t(
                        `agentic.execution.attention.risk.${migration.action?.risk || "low"}`
                      )}
                    </Label>
                  </CardHeader>
                  <CardBody>
                    <Content component="p">
                      {migration.action?.description}
                    </Content>
                    <Content component="small">
                      {t("agentic.execution.attention.planStage", {
                        plan: `${application.name}, ${migration.plan?.name}`,
                        stage: migration.currentStage,
                      })}
                    </Content>
                  </CardBody>
                  <CardFooter>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onClose();
                        history.push(
                          linkTo(
                            applicationDetailsPath(applicationId),
                            MIGRATION_TAB_SEARCH
                          )
                        );
                      }}
                    >
                      {migration.action?.requestedAction ||
                        t("agentic.execution.attention.openApplication")}
                    </Button>
                  </CardFooter>
                </Card>
              </StackItem>
            ))}
          </Stack>
        )}
      </ModalBody>
    </Modal>
  );
};
