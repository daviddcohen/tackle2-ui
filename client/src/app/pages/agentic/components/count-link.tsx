import * as React from "react";
import { LocationDescriptor } from "history";
import { Button } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { useLinkComponent } from "@app/hooks/useLinkComponent";

export interface CountLinkProps {
  to: LocationDescriptor;
  children: React.ReactNode;
}

/**
 * A "{n} {nouns}" count as a router link:
 * the cell may wrap, the count does not. The class comes from
 * react-styles so its utility CSS is loaded with the component.
 */
export const CountLink: React.FC<CountLinkProps> = ({ to, children }) => {
  const link = useLinkComponent(to);
  return (
    <Button
      variant="link"
      isInline
      className={textStyles.textNowrap}
      component={link}
    >
      {children}
    </Button>
  );
};
