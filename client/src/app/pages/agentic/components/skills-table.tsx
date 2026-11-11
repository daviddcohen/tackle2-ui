import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { List, ListItem } from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  EffectiveSkillAssociation,
  EntityRef,
  Skill,
  SkillAssociation,
  SkillAssociationScope,
} from "@app/agentic";

/** Where one skill comes from: the scope and its name, rendered as plain text. */
export interface SkillSource {
  scope: SkillAssociationScope;
  /** Server text, verbatim (for collection skills: "{agent} via {collection}"). */
  name: string;
}

/** One row of the skills table: a skill and every place it comes from. */
export interface SkillsTableRow {
  skill: EntityRef;
  sources: SkillSource[];
}

/** Resolution order (guide 2.3): agent (and its collections), archetype, target profile, application. */
const scopeOrder: SkillAssociationScope[] = [
  "agent",
  "archetype",
  "targetProfile",
  "application",
];

/**
 * Groups skill associations into one row per skill (guide 2.3, 4.9). Rows are
 * sorted by skill name; each row keeps every distinct source, in resolution
 * order and otherwise in the order the server returned them. Nothing is added:
 * the rows show exactly the sources the caller passes.
 */
export const groupSkillSources = (
  associations: EffectiveSkillAssociation[]
): SkillsTableRow[] => {
  const rows = new Map<string, SkillsTableRow>();
  for (const { skill, scope, scopeName } of associations) {
    const row = rows.get(skill.id) ?? { skill, sources: [] };
    rows.set(skill.id, row);
    if (
      !row.sources.some(
        (source) => source.scope === scope && source.name === scopeName
      )
    ) {
      row.sources.push({ scope, name: scopeName });
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      // Array sort is stable, so sources of one scope keep the server order.
      sources: [...row.sources].sort(
        (a, b) => scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope)
      ),
    }))
    .sort((a, b) => a.skill.name.localeCompare(b.skill.name));
};

/**
 * The associations of `skills` that `matches` keeps, in the shape the server
 * uses for derived skill sets, for surfaces that read `Skill.associations`
 * directly (archetype drawer, an application without a migration plan).
 */
export const skillAssociationSources = (
  skills: Skill[],
  matches: (association: SkillAssociation) => boolean
): EffectiveSkillAssociation[] =>
  skills.flatMap((skill) =>
    (skill.associations ?? []).filter(matches).map((association) => ({
      skill: { id: skill.id, name: skill.name },
      scope: association.scope,
      scopeName: association.resource.name,
    }))
  );

export interface SkillsTableProps {
  /** Rows from `groupSkillSources`; the caller's section heading counts them. */
  rows: SkillsTableRow[];
  /** Builds the skill link with the caller's breadcrumb trail and origin. */
  linkTo: (pathname: string) => LocationDescriptor;
}

/**
 * The one presentation of a skill set and its provenance (guide 2.3, 4.9,
 * kit-tables): Skill (link) · Source, one line per source as plain text
 * "{Scope}: {name}". Sources are never links: they carry no id.
 */
export const SkillsTable: React.FC<SkillsTableProps> = ({ rows, linkTo }) => {
  const { t } = useTranslation();
  const skillColumn = t("agentic.entity.skill");
  const sourceColumn = t("terms.source");
  return (
    <Table aria-label={t("agentic.skillsTable.label")} variant="compact">
      <Thead>
        <Tr>
          <Th width={40}>{skillColumn}</Th>
          <Th>{sourceColumn}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map(({ skill, sources }) => (
          <Tr key={skill.id}>
            <Td dataLabel={skillColumn}>
              <Link
                to={linkTo(
                  generatePath(DevPaths.skillDetails, { skillId: skill.id })
                )}
              >
                {skill.name}
              </Link>
            </Td>
            <Td dataLabel={sourceColumn}>
              <List isPlain>
                {sources.map((source) => (
                  <ListItem key={`${source.scope}-${source.name}`}>
                    {t("agentic.skillsTable.source", {
                      scope: t(
                        `agentic.skill.associationScope.${source.scope}`
                      ),
                      name: source.name,
                    })}
                  </ListItem>
                ))}
              </List>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};
