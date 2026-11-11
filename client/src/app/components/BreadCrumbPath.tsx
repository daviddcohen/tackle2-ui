import * as React from "react";
import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, Button } from "@patternfly/react-core";

import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";

export interface BreadCrumbPathProps {
  breadcrumbs: { title: string; path?: string | (() => void) }[];
  /**
   * Every crumb is an ancestor, so the last one is a link too: for a header
   * whose title is the current page, such as a detail drawer.
   */
  ancestorsOnly?: boolean;
}

export const BreadCrumbPath: React.FC<BreadCrumbPathProps> = ({
  breadcrumbs,
  ancestorsOnly = false,
}) => {
  return (
    <Breadcrumb>
      {breadcrumbs.map((crumb, i, { length }) => {
        const isLast = !ancestorsOnly && i === length - 1;
        if (!crumb.path) {
          // the item is not a link
          return (
            <BreadcrumbItem key={i} isActive={isLast}>
              {isLast ? (
                <span aria-current="page">{crumb.title}</span>
              ) : (
                crumb.title
              )}
            </BreadcrumbItem>
          );
        }

        const link =
          typeof crumb.path === "string" ? (
            <Link
              className="pf-v6-c-breadcrumb__link"
              to={breadcrumbTo(
                crumb.path,
                "",
                breadcrumbs
                  .slice(0, i)
                  .filter(
                    (entry): entry is BreadcrumbEntry & { path: string } =>
                      typeof entry.path === "string"
                  )
              )}
            >
              {crumb.title}
            </Link>
          ) : (
            <Button variant="link" isInline onClick={crumb.path}>
              {crumb.title}
            </Button>
          );

        return (
          <BreadcrumbItem key={i} isActive={isLast}>
            {isLast ? <span aria-current="page">{crumb.title}</span> : link}
          </BreadcrumbItem>
        );
      })}
    </Breadcrumb>
  );
};
