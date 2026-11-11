import * as React from "react";
import { Content, Flex, FlexItem, Title } from "@patternfly/react-core";

/**
 * The section stack of an agentic application tab (guide 4.2, kit amendment
 * 2): one column, `gapXl` between sections, never wrapping.
 */
export const TabSections: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Flex
    direction={{ default: "column" }}
    gap={{ default: "gapXl" }}
    flexWrap={{ default: "nowrap" }}
  >
    {/* toArray drops empty slots and keys each child by its slot, so a
        section keeps its key when an earlier one (the alert) goes away. */}
    {React.Children.toArray(children).map((child, index) => (
      <FlexItem key={React.isValidElement(child) ? child.key : index}>
        {child}
      </FlexItem>
    ))}
  </Flex>
);

/**
 * One section: `Title h2 lg` (with its count when it has rows, C3/C4), at most
 * one subtle sentence that says what the rows are, then the content.
 */
export const TabSection: React.FC<{
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
          className="pf-v6-u-text-color-subtle pf-v6-u-mt-xs"
        >
          {description}
        </Content>
      )}
    </FlexItem>
    <FlexItem>{children}</FlexItem>
  </Flex>
);
