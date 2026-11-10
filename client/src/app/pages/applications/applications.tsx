import { lazy } from "react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@patternfly/react-core";

import { PageHeader } from "@app/components/PageHeader";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";

const ApplicationsTable = lazy(() => import("./applications-table"));

export const Applications: React.FC = () => {
  const { t } = useTranslation();
  const { breadcrumbs } = useBreadcrumbs(t("sidebar.applicationInventory"), []);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={t("composed.applicationInventory")}
          breadcrumbs={breadcrumbs.length > 1 ? breadcrumbs : []}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ApplicationsTable />
      </PageSection>
    </>
  );
};
