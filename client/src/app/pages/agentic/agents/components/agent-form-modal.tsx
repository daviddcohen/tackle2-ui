import * as React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Modal, ModalHeader, Skeleton } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import { Agent } from "@app/agentic";
import { useFetchMigrationPlans } from "@app/queries/agentic";

import { getPlansUsingAgent } from "../agent-usage";

import { AgentForm } from "./agent-form";

export interface AgentFormModalProps {
  /** The agent to edit; null creates one. */
  agent: Agent | null;
  isOpen: boolean;
  /** Changes on every opening, so each one mounts a fresh form (`useFormModalState`). */
  formKey: React.Key;
  onClose: () => void;
}

/**
 * The one create/edit agent modal, opened from the list and the
 * detail page: title, one-sentence description, the consequence warning
 * when the agent is in use, then the form with its
 * submit and Cancel pinned in the footer.
 */
export const AgentFormModal: React.FC<AgentFormModalProps> = ({
  agent,
  isOpen,
  formKey,
  onClose,
}) => {
  const { t } = useTranslation();
  const { migrationPlans, isSuccess, fetchError } = useFetchMigrationPlans();

  // An edit names its consequence; until the plans are known it never looks
  // like "not used": a skeleton while they load, a warning if they fail.
  let notice: React.ReactNode = null;
  if (agent != null) {
    const planCount = isSuccess
      ? getPlansUsingAgent(agent.id, migrationPlans).length
      : 0;
    if (!isSuccess && fetchError == null) {
      notice = (
        <Skeleton
          width="50%"
          className={spacing.mbLg}
          screenreaderText={t("terms.loading")}
        />
      );
    } else if (!isSuccess || planCount > 0) {
      notice = (
        <Alert
          variant="warning"
          isInline
          isPlain
          className={spacing.mbLg}
          title={
            isSuccess
              ? t("agentic.agent.editInUse", { count: planCount })
              : t("agentic.agent.editUsageUnchecked")
          }
        />
      );
    }
  }

  return (
    <Modal
      id="agent-form-modal"
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="agent-form-modal-title"
    >
      <ModalHeader
        labelId="agent-form-modal-title"
        title={agent ? t("agentic.agent.edit") : t("agentic.agent.create")}
        description={t("agentic.agent.formDescription")}
      />
      <AgentForm
        key={formKey}
        agent={agent}
        onClose={onClose}
        notice={notice}
      />
    </Modal>
  );
};
