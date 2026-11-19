import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { Flex, FlexItem, PageSection } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { DevPaths } from "@app/Paths";
import { ControllerRunPhase, HubRef } from "@app/agentic";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

import { RunStatus } from "../../components/agentic-status";
import { DetailSections } from "../../components/detail-section";

/*
 * The text utilities are imported, not only named: the app loads PF's base
 * styles and per-component styles, so a utility class works only once its
 * module is imported (as `spacing` is across the app).
 */

/**
 * The run page status line under the title: the status, then
 * where the run or stage is and when it started, in subtle text.
 */
export const RunStatusLine: React.FC<{
  status: ControllerRunPhase;
  children?: React.ReactNode;
}> = ({ status, children }) => (
  <Flex spaceItems={{ default: "spaceItemsMd" }} className={spacing.mtSm}>
    <FlexItem>
      <RunStatus status={status} />
    </FlexItem>
    {children != null && (
      <FlexItem>
        <span className={textStyles.textColorSubtle}>{children}</span>
      </FlexItem>
    )}
  </Flex>
);

/** Up to this many applications are named; more read as a count. */
const MAX_NAMED_APPLICATIONS = 5;

/**
 * The stage page's application row, first under the title:
 * "Application: {link}" for one application, "Applications: {link}, {link}"
 * for up to five, and only "{n} applications" linking to the plan run
 * (which lists them) for more. Subtle text with the links in the link
 * color; the links keep the trail (`linkCrumbs`). Nothing renders for an
 * empty list.
 */
export const StageApplicationRow: React.FC<{
  applications: HubRef[];
  /** The run the stage belongs to: the count links to it. */
  runId: string;
  /** The trail the links carry (the stage page's child crumbs). */
  linkCrumbs: BreadcrumbEntry[];
}> = ({ applications, runId, linkCrumbs }) => {
  const { t } = useTranslation();
  if (applications.length === 0) return null;
  const linkTo = (pathname: string) => breadcrumbTo(pathname, "", linkCrumbs);
  return (
    <Flex spaceItems={{ default: "spaceItemsMd" }} className={spacing.mtSm}>
      <FlexItem>
        <span className={textStyles.textColorSubtle}>
          {applications.length > MAX_NAMED_APPLICATIONS ? (
            <Link to={linkTo(generatePath(DevPaths.planRunDetails, { runId }))}>
              {t("agentic.planRunsTable.applicationCount", {
                count: applications.length,
              })}
            </Link>
          ) : (
            <>
              {t("agentic.stageRun.applicationLabel", {
                count: applications.length,
              })}{" "}
              {applications.map((application, index) => (
                <React.Fragment key={application.id}>
                  {index > 0 && ", "}
                  <Link
                    to={linkTo(
                      generatePath(DevPaths.applicationDetails, {
                        applicationId: String(application.id),
                      })
                    )}
                  >
                    {application.name}
                  </Link>
                </React.Fragment>
              ))}
            </>
          )}
        </span>
      </FlexItem>
    </Flex>
  );
};

/**
 * The run page body: the alert, the facts and the sections
 * in the shared detail stack, inside the page section.
 */
export const RunPageBody: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <PageSection hasBodyWrapper={false}>
    <DetailSections>{children}</DetailSections>
  </PageSection>
);
