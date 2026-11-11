import * as React from "react";
import { LocationDescriptor } from "history";
import { Button } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { useLinkComponent } from "@app/hooks/useLinkComponent";

/** A "{n} {nouns}" count as a router link (guide 4.1 counts): the cell may wrap, the count does not. */
export const PlanCountLink: React.FC<{
  to: LocationDescriptor;
  children: React.ReactNode;
}> = ({ to, children }) => {
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
