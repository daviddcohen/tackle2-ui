import * as React from "react";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, List, ListItem, Popover } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { PlanTargetProfile } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { targetProfilePath } from "@app/pages/agentic/entity-paths";

type LinkTo = (pathname: string) => LocationDescriptor;

/**
 * "Quarkus 3.x (Java EE Application)": the profile name links to the
 * target profile on its archetype's Target profiles page; the archetype is
 * plain text.
 */
const TargetProfilePath: React.FC<{
  path: PlanTargetProfile;
  linkTo: LinkTo;
}> = ({ path: { archetype, targetProfile }, linkTo }) => (
  <Trans
    i18nKey="agentic.plan.targetProfilePath"
    values={{ profile: targetProfile.name, archetype: archetype.name }}
    components={{
      profileLink: (
        <Link to={linkTo(targetProfilePath(archetype.id, targetProfile.id))} />
      ),
    }}
  />
);

/**
 * The target profiles that use a plan: "Not assigned" for none, the one
 * path inline, or a "{n} target profiles" count that opens a popover
 * listing every path.
 */
export const TargetProfilesCell: React.FC<{
  planName: string;
  targetProfiles: PlanTargetProfile[];
  linkTo: LinkTo;
}> = ({ planName, targetProfiles, linkTo }) => {
  const { t } = useTranslation();
  if (targetProfiles.length === 0) {
    return <EmptyTextMessage message={t("agentic.execution.notAssigned")} />;
  }
  if (targetProfiles.length === 1) {
    return <TargetProfilePath path={targetProfiles[0]} linkTo={linkTo} />;
  }
  return (
    <Popover
      headerContent={t("agentic.plan.targetProfilesOfPlan", {
        plan: planName,
      })}
      closeBtnAriaLabel={t("actions.close")}
      bodyContent={
        <List isPlain>
          {targetProfiles.map((path) => (
            <ListItem key={`${path.archetype.id}-${path.targetProfile.id}`}>
              <TargetProfilePath path={path} linkTo={linkTo} />
            </ListItem>
          ))}
        </List>
      }
    >
      <Button variant="link" isInline className={textStyles.textNowrap}>
        {t("agentic.plan.targetProfileCount", {
          count: targetProfiles.length,
        })}
      </Button>
    </Popover>
  );
};
