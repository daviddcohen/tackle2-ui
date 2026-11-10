import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";

import { DevPaths } from "@app/Paths";
import {
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
} from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useStartApplicationMigrationsMutation } from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { planRunPath } from "./paths";

/**
 * Starts migrations and opens what the server created: the plan run when one
 * was created, or the plan run list when the applications resolved to several
 * Plans (one run per Plan).
 */
export const useStartMigrations = (
  linkCrumbs: BreadcrumbEntry[],
  onStarted?: (
    response: StartApplicationMigrationsResponse,
    request: StartApplicationMigrationsRequest
  ) => void
) => {
  const { t } = useTranslation();
  const history = useHistory();
  const { pushNotification } = React.useContext(NotificationsContext);

  const { mutate, isPending } = useStartApplicationMigrationsMutation(
    (response, request) => {
      onStarted?.(response, request);
      const { planRuns } = response;
      if (planRuns.length === 1) {
        history.push(breadcrumbTo(planRunPath(planRuns[0].id), "", linkCrumbs));
      } else {
        pushNotification({
          title: t("agentic.execution.queued", {
            count: request.applicationIds.length,
          }),
          variant: "success",
        });
        history.push(breadcrumbTo(DevPaths.planRuns, "", linkCrumbs));
      }
    },
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  return { startMigrations: mutate, isStarting: isPending };
};
