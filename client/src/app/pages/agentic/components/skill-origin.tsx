import * as React from "react";
import { LocationDescriptor, parsePath } from "history";
import { Trans } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { List, ListItem } from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { SkillOrigin } from "@app/agentic";
import {
  applicationSkillsPath,
  archetypePath,
  targetProfilePath,
} from "@app/pages/agentic/entity-paths";

/** What the page already says, so the From values need not repeat it. */
export interface SkillOriginOptions {
  /**
   * The archetype in context: on an application's page, the archetype of its
   * default migration path. A target profile of another archetype is named
   * with its archetype ("Quarkus 3.x (Java EE Application)"); without it the
   * archetype always shows. Plan and run pages pass none: a plan's target
   * profiles can belong to several archetypes.
   */
  archetypeId?: number;
  /** The application whose page this is: its origin reads "This application". */
  thisApplicationId?: number;
}

/** One From value, before it is rendered. */
export interface FormattedSkillOrigin {
  /** `agentic.stageSkills.origin.*`, a Trans key with a `<nameLink>` tag around the name. */
  i18nKey: string;
  values: { name?: string; archetype?: string };
  /**
   * Where the named object is edited: pathname with any search and hash.
   * Absent for "This application" (the reader is on it).
   */
  path?: string;
}

/**
 * The one From formatter: "Agent: {name}", "Collection:
 * {name}", "Archetype: {name}", "Target profile: {name}" (plus "
 * ({archetype})" outside the link when the profile's archetype is not the
 * one in context), "Application: {name}" or "This application". Each name
 * links to where it is edited: the agent and collection pages, the
 * archetype drawer's Skills tab, the target profile on its archetype's
 * target profiles page, the application's Skills tab.
 */
export const formatSkillOrigin = (
  origin: SkillOrigin,
  options: SkillOriginOptions = {}
): FormattedSkillOrigin => {
  const key = "agentic.stageSkills.origin";
  switch (origin.kind) {
    case "agent":
      return {
        i18nKey: `${key}.agent`,
        values: { name: origin.agent.name },
        path: generatePath(DevPaths.agentDetails, {
          agentId: origin.agent.id,
        }),
      };
    case "collection":
      return {
        i18nKey: `${key}.collection`,
        values: { name: origin.collection.name },
        path: generatePath(DevPaths.skillCollectionDetails, {
          collectionId: origin.collection.id,
        }),
      };
    case "archetype":
      return {
        i18nKey: `${key}.archetype`,
        values: { name: origin.archetype.name },
        path: archetypePath(origin.archetype.id, "skills"),
      };
    case "targetProfile": {
      const path = targetProfilePath(
        origin.archetype.id,
        origin.targetProfile.id
      );
      return origin.archetype.id === options.archetypeId
        ? {
            i18nKey: `${key}.targetProfile`,
            values: { name: origin.targetProfile.name },
            path,
          }
        : {
            i18nKey: `${key}.targetProfileWithArchetype`,
            values: {
              name: origin.targetProfile.name,
              archetype: origin.archetype.name,
            },
            path,
          };
    }
    case "application":
      return origin.application.id === options.thisApplicationId
        ? { i18nKey: `${key}.thisApplication`, values: {} }
        : {
            i18nKey: `${key}.application`,
            values: { name: origin.application.name },
            path: applicationSkillsPath(origin.application.id),
          };
  }
};

/**
 * Builds a link with the caller's breadcrumb trail (see `StageSkillsTable`).
 * `search` is always given (may be ""), and may hold a query and a hash
 * (the archetype drawer's tab, a target profile anchor): a caller that adds
 * its own `?from=` merges it with `searchWithFrom`, so those are kept.
 */
export type SkillLinkTo = (
  pathname: string,
  search: string
) => LocationDescriptor;

/**
 * `search` (a query and an optional hash) with `from` set: the caller's
 * origin (`run-4`, `plan-1`) for links that also carry their own query.
 */
export const searchWithFrom = (search: string, from: string) => {
  const hashIndex = search.indexOf("#");
  const query = hashIndex >= 0 ? search.slice(0, hashIndex) : search;
  const hash = hashIndex >= 0 ? search.slice(hashIndex) : "";
  const params = new URLSearchParams(query);
  params.set("from", from);
  return `?${params}${hash}`;
};

/**
 * Splits a path into the caller's `linkTo(pathname, search)`; the search
 * carries any hash after it, which `breadcrumbTo` keeps.
 */
export const linkToPath = (linkTo: SkillLinkTo, path: string) => {
  const { pathname = "", search = "", hash = "" } = parsePath(path);
  return linkTo(pathname, `${search}${hash}`);
};

export interface SkillOriginTextProps {
  origin: SkillOrigin;
  options?: SkillOriginOptions;
  /** Without it the name is plain text (wizard, dialogs). */
  linkTo?: SkillLinkTo;
}

/** One From value; the name links where it is edited when `linkTo` is given. */
export const SkillOriginText: React.FC<SkillOriginTextProps> = ({
  origin,
  options,
  linkTo,
}) => {
  const { i18nKey, values, path } = formatSkillOrigin(origin, options);
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      components={{
        nameLink:
          linkTo != null && path != null ? (
            <Link to={linkToPath(linkTo, path)} />
          ) : (
            <span />
          ),
      }}
    />
  );
};

/** Every origin of one skill, one line each, in the order given. */
export const SkillOriginList: React.FC<{
  origins: SkillOrigin[];
  options?: SkillOriginOptions;
  linkTo?: SkillLinkTo;
}> = ({ origins, options, linkTo }) => (
  <List isPlain>
    {origins.map((origin, index) => (
      <ListItem key={`${origin.kind}-${index}`}>
        <SkillOriginText origin={origin} options={options} linkTo={linkTo} />
      </ListItem>
    ))}
  </List>
);
