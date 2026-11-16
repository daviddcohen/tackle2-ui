import * as React from "react";
import { LocationDescriptor } from "history";
import { Link } from "react-router-dom";

/**
 * A router `Link` to `to`, as the `component` of a PatternFly `Button` or
 * `AlertActionLink`. An inline `component={(props) => <Link … />}` is a new
 * component type on every render, so React remounts the anchor each time
 * (and drops its focus). This keeps one type for as long as the target is
 * the same, compared by value because callers build a new location object
 * on each render. Undefined when there is no target. The target is compared
 * through JSON, so its `state` must be plain data (the breadcrumb trail is):
 * anything JSON drops is dropped from the link too.
 */
export const useLinkComponent = (to: LocationDescriptor | undefined) => {
  const target = to === undefined ? undefined : JSON.stringify(to);
  return React.useMemo(() => {
    if (target === undefined) return undefined;
    const location: LocationDescriptor = JSON.parse(target);
    return React.forwardRef<HTMLAnchorElement, object>(
      function RouterLink(props, ref) {
        return <Link {...props} ref={ref} to={location} />;
      }
    );
  }, [target]);
};
