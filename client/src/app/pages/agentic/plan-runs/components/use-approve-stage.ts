import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";

import { EntityId, StageRun } from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useApproveStageMutation } from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

/**
 * Approves a stage of a plan run, for the plan run page and the stage page
 * alike: a "{stage} approved" toast on success, the server's message on
 * failure (applications AP13). The returned promise rejects on failure, so
 * `StageAttentionAlert` closes its confirm either way.
 */
export const useApproveStage = (runId: EntityId) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { mutateAsync, isPending } = useApproveStageMutation(
    () => undefined,
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );
  const approve = (stageRun: StageRun) =>
    mutateAsync({ runId, stageId: stageRun.stageId }).then(() =>
      pushNotification({
        title: t("agentic.planRun.stageApproved", { stage: stageRun.name }),
        variant: "success",
      })
    );
  return { approve, isApproving: isPending };
};
