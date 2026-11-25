import * as React from "react";
import { AxiosError } from "axios";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ButtonVariant } from "@patternfly/react-core";

import { MigrationPlan } from "@app/agentic";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useDeleteMigrationPlanMutation } from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

/**
 * Why `plan` cannot be deleted, or undefined when it can: the list row and
 * the detail Actions menu say the same thing. In the server's order: a plan
 * with runs, then a plan that target profiles use (with how many
 * applications it can migrate, when it has any). Usage the server did not
 * report blocks the delete.
 */
export const getPlanDeleteBlocker = (
  plan: MigrationPlan,
  t: TFunction
): string | undefined => {
  if (
    plan.runCount == null ||
    plan.applicationImpact == null ||
    plan.migrationPaths == null
  ) {
    return t("agentic.common.usageUnchecked");
  }
  if (plan.runCount > 0) {
    return t("agentic.plan.deleteUsedByRuns", { count: plan.runCount });
  }
  const paths = plan.migrationPaths;
  if (paths.length === 0) {
    return undefined;
  }
  const profiles = paths.map(({ archetype, targetProfile }) =>
    t("agentic.skill.targetProfileOption", {
      profile: targetProfile.name,
      archetype: archetype.name,
    })
  );
  return plan.applicationImpact.matching > 0
    ? t("agentic.plan.deleteMatchingApplications", {
        count: plan.applicationImpact.matching,
        profiles,
      })
    : t("agentic.plan.deleteAssigned", { count: paths.length, profiles });
};

/**
 * The delete confirm (no title icon, no consequence
 * sentence) and its mutation. The mutation lives in the page, not in the
 * dialog, so its toast survives the dialog closing.
 */
export const useDeletePlanDialog = (onDeleted?: () => void) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const [plan, setPlan] = React.useState<MigrationPlan>();
  const { mutate: deletePlan } = useDeleteMigrationPlanMutation(
    () => {
      onDeleted?.();
      pushNotification({
        title: t("agentic.plan.deleted"),
        variant: "success",
      });
    },
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );
  const dialog =
    plan == null ? null : (
      <ConfirmDialog
        isOpen
        title={t("agentic.plan.deleteTitle")}
        message={t("agentic.plan.deleteDescription", { plan: plan.name })}
        confirmBtnVariant={ButtonVariant.danger}
        confirmBtnLabel={t("actions.delete")}
        cancelBtnLabel={t("actions.cancel")}
        onCancel={() => setPlan(undefined)}
        onClose={() => setPlan(undefined)}
        onConfirm={() => {
          deletePlan(plan.id);
          setPlan(undefined);
        }}
      />
    );
  return { requestDelete: setPlan, dialog };
};
