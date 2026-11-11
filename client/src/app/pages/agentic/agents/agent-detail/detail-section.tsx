import * as React from "react";
import { Content, Flex, FlexItem, Title } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

export interface DetailSectionProps {
  /** The heading, with its count when the section has rows ("Test runs (1)"). */
  title: string;
  /** At most one subtle sentence: what the rows are or how to get more (C3). */
  description?: string;
  children: React.ReactNode;
}

/** A section of a detail tab (guide 4.2): `Title h2 lg`, its sentence, its content. */
export const DetailSection: React.FC<DetailSectionProps> = ({
  title,
  description,
  children,
}) => (
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
    <FlexItem>{children}</FlexItem>
  </Flex>
);

/** The stack of sections in a tab body (kit amendment 2: nowrap, no holes). */
export const DetailSections: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Flex
    direction={{ default: "column" }}
    gap={{ default: "gapXl" }}
    flexWrap={{ default: "nowrap" }}
  >
    {React.Children.toArray(children)
      .filter(Boolean)
      .map((child, index) => (
        <FlexItem key={index}>{child}</FlexItem>
      ))}
  </Flex>
);
