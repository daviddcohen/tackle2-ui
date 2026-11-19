import * as React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Button } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import {
  StartApplicationMigrationsRequest,
  StartApplicationMigrationsResponse,
} from "@app/agentic";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { useStartApplicationMigrationsMutation } from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { planRunPath } from "./paths";

/**
 * Starts migrations and shows what the server created: it opens the plan run
 * when one was created. When the applications resolved to several plans (one
 * run per plan), the page stays and a toast links to the plan runs.
 * When the server created none, a danger toast says so.
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
  const PlanRunsLink = useLinkComponent(
    breadcrumbTo(DevPaths.planRuns, "", linkCrumbs)
  );

  const { mutate, isPending } = useStartApplicationMigrationsMutation(
    (response, request) => {
      onStarted?.(response, request);
      const { planRuns } = response;
      if (planRuns.length === 0) {
        // The request succeeded but created nothing: say so, never "0 started".
        pushNotification({
          title: t("agentic.execution.noPlanRunStarted"),
          variant: "danger",
        });
      } else if (planRuns.length === 1) {
        history.push(breadcrumbTo(planRunPath(planRuns[0].id), "", linkCrumbs));
      } else {
        pushNotification({
          title: t("agentic.execution.planRunsStarted", {
            count: planRuns.length,
          }),
          message: (
            <Button variant="link" isInline component={PlanRunsLink}>
              {t("agentic.execution.viewPlanRuns")}
            </Button>
          ),
          variant: "success",
        });
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
