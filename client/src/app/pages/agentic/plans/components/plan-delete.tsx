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
 * the detail Actions menu say the same thing. A plan with runs, a plan that
 * applications resolve to, and the assigned plan of a target profile are
 * kept. Usage the server did not report blocks the delete (addenda X6, P5).
 */
export const getPlanDeleteBlocker = (
  plan: MigrationPlan,
  t: TFunction
): string | undefined => {
  if (plan.runCount == null || plan.applicationImpact == null) {
    return t("agentic.common.usageUnchecked");
  }
  if (plan.runCount > 0) {
    return t("agentic.plan.deleteUsedByRuns", { count: plan.runCount });
  }
  const profiles = (plan.migrationPath?.targetProfiles ?? [])
    .map((profile) => profile.name)
    .join(", ");
  if (plan.applicationImpact.matching > 0) {
    return t("agentic.plan.deleteMatchingApplications", {
      count: plan.applicationImpact.matching,
      profile: profiles,
    });
  }
  if (plan.migrationPath?.isDefault === true) {
    return t("agentic.plan.deleteAssigned", {
      archetype: plan.migrationPath.archetype.name,
      profile: profiles,
    });
  }
  return undefined;
};

/**
 * The delete confirm (kit-confirm, addenda P1: no title icon, no consequence
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
