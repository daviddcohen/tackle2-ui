import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import type { Archetype } from "@app/api/models";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import {
  targetProfilePath,
  targetProfilesPath,
} from "@app/pages/agentic/entity-paths";

/**
 * The archetype's target profiles as a link, the same element as the
 * Applications count beside it: one profile is its name
 * linking to its row, several are a count linking to the page (4.10).
 */
const LinkToArchetypeTargetProfiles: React.FC<{
  archetype: Archetype;
  linkTo: (pathname: string) => LocationDescriptor;
}> = ({ archetype, linkTo }) => {
  const { t } = useTranslation();
  const profiles = archetype.profiles ?? [];

  if (profiles.length === 0) {
    return <EmptyTextMessage message={t("terms.none")} />;
  }
  if (profiles.length === 1) {
    return (
      <Link to={linkTo(targetProfilePath(archetype.id, profiles[0].id))}>
        {profiles[0].name}
      </Link>
    );
  }
  return (
    <Link
      className={textStyles.textNowrap}
      to={linkTo(targetProfilesPath(archetype.id))}
    >
      {t("agentic.archetype.targetProfileCount", { count: profiles.length })}
    </Link>
  );
};

export default LinkToArchetypeTargetProfiles;
