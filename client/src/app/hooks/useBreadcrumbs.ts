import { createPath, parsePath } from "history";
import { useLocation } from "react-router-dom";

export interface BreadcrumbEntry {
  title: string;
  path?: string;
}

export interface BreadcrumbState {
  breadcrumbs?: BreadcrumbEntry[];
}

/** A trail belongs to a history entry, so browser Back, Forward and reload retain it. */
export const useIncomingBreadcrumbs = () => {
  const { state } = useLocation<BreadcrumbState>();
  const entries = state?.breadcrumbs;
  if (!Array.isArray(entries)) return undefined;
  // History state can come from an older client or another navigation surface.
  return entries.filter(
    (entry): entry is BreadcrumbEntry =>
      entry != null &&
      typeof entry.title === "string" &&
      entry.title.length > 0 &&
      typeof entry.path === "string" &&
      entry.path.startsWith("/") &&
      !entry.path.startsWith("//")
  );
};

/** The pathname, selected drawer and profile anchor identify the entity; other parameters describe its view. */
const entityKey = (path: string) => {
  const { pathname, search, hash = "" } = parsePath(path);
  const selection = [...new URLSearchParams(search)].filter(
    ([key]) => key === "activeItem" || key.endsWith(":activeItem")
  );
  return `${pathname}${hash}?${new URLSearchParams(selection)}`;
};

/** Returning to an ancestor restores its view and removes descendants instead of making a cycle. */
export const breadcrumbTo = (
  pathname: string,
  search: string,
  trail: BreadcrumbEntry[]
) => {
  const destination = pathname + search;
  const ancestorIndex = trail.findIndex(
    (entry) =>
      entry.path != null && entityKey(entry.path) === entityKey(destination)
  );
  const ancestorPath = trail[ancestorIndex]?.path;
  return {
    ...parsePath(ancestorPath ?? destination),
    state: {
      breadcrumbs: ancestorIndex >= 0 ? trail.slice(0, ancestorIndex) : trail,
    },
  };
};

export const useBreadcrumbs = (title: string, fallback: BreadcrumbEntry[]) => {
  const location = useLocation();
  const incoming = useIncomingBreadcrumbs();
  const ancestors = incoming ?? fallback;
  const linkCrumbs = [...ancestors, { title, path: createPath(location) }];
  return {
    breadcrumbs: [...ancestors, { title }],
    linkCrumbs,
    to: (pathname: string, search = "") =>
      breadcrumbTo(pathname, search, linkCrumbs),
  };
};
