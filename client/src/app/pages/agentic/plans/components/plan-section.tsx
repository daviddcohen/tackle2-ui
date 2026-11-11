import * as React from "react";
import { Content, Flex, FlexItem, Title } from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

export interface PlanSectionProps {
  title: string;
  /** At most one subtle sentence: what the rows are or how to get more (guide 4.2). */
  description?: React.ReactNode;
  children: React.ReactNode;
}

/** A detail section (guide 4.2, kit-detail): `Title h2 lg`, an optional sentence, then the content. */
export const PlanSection: React.FC<PlanSectionProps> = ({
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
      {description != null && (
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

/** The stack of a tab's sections (kit amendment 2: `nowrap`, or PF column Flex leaves holes). */
export const PlanSections: React.FC<{ children: React.ReactNode }> = ({
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
