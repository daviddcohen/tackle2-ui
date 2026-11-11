import * as React from "react";
import { Flex, FlexItem, PageSection } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { ControllerRunPhase } from "@app/agentic";

import { RunStatus } from "../../components/agentic-status";
import { DetailSections } from "../../components/detail-section";

/*
 * The text utilities are imported, not only named: the app loads PF's base
 * styles and per-component styles, so a utility class works only once its
 * module is imported (as `spacing` is across the app).
 */

/**
 * The run page status line under the title (guide 4.3): the status, then
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

/**
 * The run page body (guide 4.2, 4.3): the alert, the facts and the sections
 * in the shared detail stack, inside the page section.
 */
export const RunPageBody: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <PageSection hasBodyWrapper={false}>
    <DetailSections>{children}</DetailSections>
  </PageSection>
);
