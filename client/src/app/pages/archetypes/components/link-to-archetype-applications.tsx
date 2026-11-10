import * as React from "react";
import { parsePath } from "history";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Content } from "@patternfly/react-core";

import { Paths } from "@app/Paths";
import type { Archetype } from "@app/api/models";
import { serializeFilterUrlParams } from "@app/hooks/table-controls";
import { useBreadcrumbs } from "@app/hooks/useBreadcrumbs";
import { useFetchArchetypes } from "@app/queries/archetypes";

const getApplicationsUrl = (archetypeName?: string) => {
  if (!archetypeName) return "";

  const filterValues = {
    archetypes: [archetypeName],
  };

  const serializedParams = serializeFilterUrlParams(filterValues);

  const queryString = serializedParams.filters
    ? `filters=${serializedParams.filters}`
    : "";
  return `${Paths.applications}?${queryString}`;
};

const LinkToArchetypeApplications: React.FC<{
  archetype: Archetype | null | undefined;
  noApplicationsMessage?: React.ReactNode;
}> = ({ archetype, noApplicationsMessage }) => {
  const { t } = useTranslation();
  const { search } = useLocation();
  const { archetypes } = useFetchArchetypes();
  const selectedId = new URLSearchParams(search).get("ar:activeItem");
  const selected = archetypes.find(
    (candidate) => String(candidate.id) === selectedId
  );
  const { to } = useBreadcrumbs(
    selected?.name ?? t("terms.archetypes"),
    selected ? [{ title: t("terms.archetypes"), path: Paths.archetypes }] : []
  );

  const hasApplications = (archetype?.applications?.length ?? 0) > 0;
  const destination = getApplicationsUrl(archetype?.name);

  return !hasApplications && noApplicationsMessage ? (
    <>{noApplicationsMessage}</>
  ) : !hasApplications && !noApplicationsMessage ? (
    <Content component="p">{t("message.archetypeNoApplications")}</Content>
  ) : (
    <Link to={{ ...to(destination), search: parsePath(destination).search }}>
      {t("message.archetypeApplicationCount", {
        count: archetype?.applications?.length ?? 0,
      })}
    </Link>
  );
};

export default LinkToArchetypeApplications;
