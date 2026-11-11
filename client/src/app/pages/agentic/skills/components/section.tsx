import * as React from "react";
import {
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Title,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

export interface SectionProps {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * One section of a skill or skill collection page: Title h2 lg, an optional
 * subtle sentence, then the content (guide 4.2). The classes come from
 * react-styles so their utility CSS is loaded.
 */
export const Section: React.FC<SectionProps> = ({
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

/** The sections stack of a page or tab body (guide 4.2, kit amendment 2). */
export const Sections: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Flex
    direction={{ default: "column" }}
    gap={{ default: "gapXl" }}
    flexWrap={{ default: "nowrap" }}
  >
    {children}
  </Flex>
);

/** The one-sentence empty state of a section (guide 4.2, C4). */
export const XsEmptyState: React.FC<{ text: string }> = ({ text }) => (
  <EmptyState variant="xs">
    <EmptyStateBody>{text}</EmptyStateBody>
  </EmptyState>
);
