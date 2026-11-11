import * as React from "react";
import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  PageSection,
  Title,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { ControllerRunPhase } from "@app/agentic";

import { RunStatus } from "../../components/agentic-status";

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
 * One FlexItem per child, empty children left out. Each item keeps the key
 * `toArray` gives its child, which counts the empty slots, so a conditional
 * child (the attention alert) that appears or goes does not remount the
 * sections after it and they keep their state (an expanded output).
 */
const stackItems = (children: React.ReactNode) =>
  React.Children.toArray(children).map((child, index) => (
    <FlexItem key={React.isValidElement(child) ? (child.key ?? index) : index}>
      {child}
    </FlexItem>
  ));

/**
 * The run page body (guide 4.2, 4.3): the alert, the facts and the sections,
 * stacked with the section gap. Empty children are left out.
 */
export const RunPageBody: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <PageSection hasBodyWrapper={false}>
    <Flex
      direction={{ default: "column" }}
      gap={{ default: "gapXl" }}
      flexWrap={{ default: "nowrap" }}
    >
      {stackItems(children)}
    </Flex>
  </PageSection>
);

/**
 * The run page facts (guide 4.3): plain term and value pairs in two columns
 * on wide screens, under the alert and above the sections.
 */
export const RunPageFacts: React.FC<{
  facts: [term: string, description: React.ReactNode][];
}> = ({ facts }) => (
  <DescriptionList
    isHorizontal
    isCompact
    horizontalTermWidthModifier={{ default: "18ch" }}
    columnModifier={{ lg: "2Col" }}
  >
    {facts.map(([term, description]) => (
      <DescriptionListGroup key={term}>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        <DescriptionListDescription>{description}</DescriptionListDescription>
      </DescriptionListGroup>
    ))}
  </DescriptionList>
);

/** One section: its heading, an optional subtle sentence, then its content. */
export const RunPageSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <Flex
    direction={{ default: "column" }}
    gap={{ default: "gapMd" }}
    flexWrap={{ default: "nowrap" }}
  >
    <FlexItem>
      <Title headingLevel="h2" size="lg">
        {title}
      </Title>
      {description && (
        <Content
          component="p"
          className={`${textStyles.textColorSubtle} ${spacing.mtXs}`}
        >
          {description}
        </Content>
      )}
    </FlexItem>
    {stackItems(children)}
  </Flex>
);
