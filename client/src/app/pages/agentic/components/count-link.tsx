import * as React from "react";
import { LocationDescriptor } from "history";
import { Button } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { useLinkComponent } from "@app/hooks/useLinkComponent";

export interface CountLinkProps {
  to: LocationDescriptor;
  children: React.ReactNode;
  /**
   * Drops the link's nowrap, for a summary of several counts ("2 agents,
   * 1 collection, 1 archetype") that would otherwise hold its column at full
   * width. The caller keeps each count whole (a nowrap span per count).
   */
  canWrap?: boolean;
}

/**
 * A "{n} {nouns}" count as a router link:
 * the cell may wrap, the count does not (unless `canWrap`). The class comes from
 * react-styles so its utility CSS is loaded with the component.
 */
export const CountLink: React.FC<CountLinkProps> = ({
  to,
  children,
  canWrap = false,
}) => {
  const link = useLinkComponent(to);
  return (
    <Button
      variant="link"
      isInline
      className={canWrap ? undefined : textStyles.textNowrap}
      component={link}
    >
      {children}
    </Button>
  );
};
