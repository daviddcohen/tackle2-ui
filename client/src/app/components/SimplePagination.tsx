import * as React from "react";
import {
  Pagination,
  PaginationProps,
  PaginationVariant,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

export interface SimplePaginationProps {
  paginationProps: Pick<
    PaginationProps,
    "itemCount" | "perPage" | "page" | "onSetPage" | "onPerPageSelect"
  >;
  isTop: boolean;
  isCompact?: boolean;
  noMargin?: boolean;
  idPrefix?: string;
}

export const SimplePagination: React.FC<SimplePaginationProps> = ({
  paginationProps,
  isTop,
  isCompact = false,
  noMargin = false,
  idPrefix = "",
}) => {
  const generatedId = React.useId().replaceAll(":", "");
  const paginationId = `${
    idPrefix || `pagination-${generatedId}`
  }-pagination-${isTop ? "top" : "bottom"}`;

  React.useEffect(() => {
    const currentPageInput = document
      .getElementById(paginationId)
      ?.querySelector<HTMLInputElement>('input[type="number"]');

    if (currentPageInput) {
      currentPageInput.id = `${paginationId}-current-page`;
      currentPageInput.name = `${paginationId}-current-page`;
    }
  }, [paginationId]);

  return (
    <Pagination
      id={paginationId}
      variant={isTop ? PaginationVariant.top : PaginationVariant.bottom}
      className={isTop || noMargin ? "" : spacing.mtMd}
      isCompact={isCompact}
      {...paginationProps}
      widgetId={paginationId}
    />
  );
};
