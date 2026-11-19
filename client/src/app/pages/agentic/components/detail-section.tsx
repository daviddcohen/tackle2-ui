import * as React from "react";
import { LocationDescriptor } from "history";
import { Link } from "react-router-dom";
import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Title,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

/*
 * The building blocks of agentic detail and run pages:
 * a stack of sections, each a heading with an optional subtle
 * sentence; facts as term and value pairs; link labels for a set of related
 * objects; and a section's one-sentence empty state.
 *
 * The utility classes come from their react-styles modules: the app loads
 * PatternFly's base and component styles only, so a utility class works once
 * its module is imported.
 */

/**
 * One FlexItem per child, empty children left out. Each item keeps the key
 * `toArray` gives its child, which counts the empty slots, so a conditional
 * child (an alert) that appears or goes does not remount the children after
 * it, and they keep their state (table sorting, an expanded output).
 */
const stackItems = (children: React.ReactNode) =>
  React.Children.toArray(children).map((child, index) => (
    <FlexItem key={React.isValidElement(child) ? (child.key ?? index) : index}>
      {child}
    </FlexItem>
  ));

/**
 * The stack of a page or tab body: the alert, the facts and the sections,
 * with the section gap and no wrapping (a wrapping column
 * Flex leaves holes). Empty children are left out.
 */
export const DetailSections: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Flex
    direction={{ default: "column" }}
    gap={{ default: "gapXl" }}
    flexWrap={{ default: "nowrap" }}
  >
    {stackItems(children)}
  </Flex>
);

export interface DetailSectionProps {
  /** Anchors the section, for a link to it from elsewhere on the page. */
  id?: string;
  /** The heading, with its count when the section has rows ("Test runs (1)"). */
  title: string;
  /** At most one subtle sentence: what the rows are or how to get more. */
  description?: React.ReactNode;
  /** The content; several children stack with the content gap. */
  children: React.ReactNode;
}

/** One section: `Title h2 lg`, its optional sentence, then its content. */
export const DetailSection: React.FC<DetailSectionProps> = ({
  id,
  title,
  description,
  children,
}) => (
  <Flex
    id={id}
    direction={{ default: "column" }}
    gap={{ default: "gapMd" }}
    flexWrap={{ default: "nowrap" }}
  >
    <FlexItem>
      <Title headingLevel="h2" size="lg">
        {title}
      </Title>
      {description != null && description !== "" && (
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

/** A section's empty state: one sentence, no icon, no "(0)" heading. */
export const SectionEmpty: React.FC<{ children: string }> = ({ children }) => (
  <EmptyState variant="xs">
    <EmptyStateBody>{children}</EmptyStateBody>
  </EmptyState>
);

export interface DetailFactsProps {
  /** Term and value pairs, in order. */
  facts: [term: string, description: React.ReactNode][];
  /** Two columns from the lg breakpoint, as the run pages show them. */
  isTwoColumn?: boolean;
}

/** Plain term and value pairs under the header. */
export const DetailFacts: React.FC<DetailFactsProps> = ({
  facts,
  isTwoColumn,
}) => (
  <DescriptionList
    isHorizontal
    isCompact
    horizontalTermWidthModifier={{ default: "18ch" }}
    columnModifier={isTwoColumn ? { lg: "2Col" } : undefined}
  >
    {facts.map(([term, description]) => (
      <DescriptionListGroup key={term}>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        <DescriptionListDescription>{description}</DescriptionListDescription>
      </DescriptionListGroup>
    ))}
  </DescriptionList>
);

export interface LinkLabelItem {
  id: React.Key;
  name: string;
  to: LocationDescriptor;
}

/**
 * A set-valued fact as outlined, clickable link labels, even for one item:
 * the first five, then "more". The caller renders
 * the empty case ("None").
 */
export const LinkLabels: React.FC<{ items: LinkLabelItem[] }> = ({ items }) => (
  <LabelGroup numLabels={5}>
    {items.map((item) => (
      <Label
        key={item.id}
        variant="outline"
        isCompact
        isClickable
        render={({ className, content }) => (
          <Link className={className} to={item.to}>
            {content}
          </Link>
        )}
      >
        {item.name}
      </Label>
    ))}
  </LabelGroup>
);
