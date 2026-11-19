import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Checkbox,
  Flex,
  FlexItem,
  Label,
  List,
  ListItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  EffectiveSkillAssociation,
  EntityRef,
  PlanSkill,
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
  /** The plan excludes this skill: it resolves but is not given to the agents. */
  excluded?: boolean;
}

/** Resolution order: agent (and its collections), archetype, target profile, application. */
const scopeOrder: SkillAssociationScope[] = [
  "agent",
  "archetype",
  "targetProfile",
  "application",
];

/**
 * Groups skill associations into one row per skill. Rows are
 * sorted by skill name; each row keeps every distinct source, in resolution
 * order and otherwise in the order the server returned them. Nothing is added:
 * the rows show exactly the sources the caller passes. `excluded` holds the
 * skills the server reports as excluded by the plan (run snapshot,
 * application view); their rows stay in the table, marked excluded.
 */
export const groupSkillSources = (
  associations: EffectiveSkillAssociation[],
  excluded: EffectiveSkillAssociation[] = []
): SkillsTableRow[] => {
  const rows = new Map<string, SkillsTableRow>();
  const usedIds = new Set(associations.map(({ skill }) => skill.id));
  for (const { skill, scope, scopeName } of [...associations, ...excluded]) {
    const row = rows.get(skill.id) ?? {
      skill,
      sources: [],
      ...(usedIds.has(skill.id) ? {} : { excluded: true }),
    };
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
 * Rows for a plan's resolved skills (`PlanSkill[]` from the plan skill
 * resolution), through the same grouping and order as `groupSkillSources`.
 * Callers that hold unsaved exclusions (the plan wizard) set `excluded` on
 * the entries before passing them.
 */
export const planSkillRows = (planSkills: PlanSkill[]): SkillsTableRow[] => {
  const toAssociations = (entries: PlanSkill[]) =>
    entries.flatMap(({ skill, sources }) =>
      sources.map(({ scope, scopeName }) => ({ skill, scope, scopeName }))
    );
  return groupSkillSources(
    toAssociations(planSkills.filter((entry) => !entry.excluded)),
    toAssociations(planSkills.filter((entry) => entry.excluded))
  );
};

/**
 * The "used of total" count of a skill set: every row, and the rows the
 * plan does not exclude. Surfaces pick their "{used} of {count} used" or
 * plain count wording from it. The skill page counts its plan rows with it.
 */
export const skillRowCounts = (
  rows: Pick<SkillsTableRow, "excluded">[] = []
) => ({
  used: rows.filter((row) => row.excluded !== true).length,
  total: rows.length,
});

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

/**
 * Where one skill comes from, as the Source cell shows it: one plain-text
 * line "{Scope}: {name}" per source, stacked. Exported for tables that list
 * sources under another first column (the skill page's migration plans).
 */
export const SkillSources: React.FC<{ sources: SkillSource[] }> = ({
  sources,
}) => {
  const { t } = useTranslation();
  return (
    <List isPlain>
      {sources.map((source) => (
        <ListItem key={`${source.scope}-${source.name}`}>
          {t("agentic.skillsTable.source", {
            // A scope this client does not know yet reads as the server sent it.
            scope: t(`agentic.skillsTable.scope.${source.scope}`, {
              defaultValue: source.scope,
            }),
            name: source.name,
          })}
        </ListItem>
      ))}
    </List>
  );
};

export interface SkillsTableProps {
  /** Rows from `groupSkillSources` or `planSkillRows`; the caller's section heading counts them. */
  rows: SkillsTableRow[];
  /**
   * Builds the skill link with the caller's breadcrumb trail and origin.
   * Without it skill names are plain text (the plan wizard and the Run
   * migration plan dialog, where a link would leave the unsaved form).
   */
  linkTo?: (pathname: string) => LocationDescriptor;
  /**
   * Exclusion mode (plan wizard): adds a leading checkbox per row, checked
   * when the skill is used. Without it the table is read-only and excluded
   * rows carry an "Excluded" marker instead.
   */
  onUsedChange?: (skill: EntityRef, used: boolean) => void;
}

/**
 * The one presentation of a skill set and its provenance:
 * Skill (link) · Source, one line per source as plain text
 * "{Scope}: {name}". Sources are never links: they carry no id.
 *
 * Excluded skills stay in the table. Read-only, they carry an outline
 * "Excluded" marker; in exclusion mode the cleared checkbox is
 * the only signal. The checkbox is a PF `Checkbox` rather than
 * `Td select`, whose built-in label ("Select row {n}") cannot name the skill.
 */
export const SkillsTable: React.FC<SkillsTableProps> = ({
  rows,
  linkTo,
  onUsedChange,
}) => {
  const { t } = useTranslation();
  const skillColumn = t("agentic.entity.skill");
  const sourceColumn = t("terms.source");
  const usedColumn = t("agentic.skillsTable.used");
  const skillName = (skill: EntityRef) =>
    linkTo ? (
      <Link
        to={linkTo(generatePath(DevPaths.skillDetails, { skillId: skill.id }))}
      >
        {skill.name}
      </Link>
    ) : (
      skill.name
    );
  return (
    <Table aria-label={t("agentic.skillsTable.label")} variant="compact">
      <Thead>
        <Tr>
          {onUsedChange != null && (
            <Th screenReaderText={usedColumn} modifier="fitContent" />
          )}
          <Th width={40}>{skillColumn}</Th>
          <Th>{sourceColumn}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map(({ skill, sources, excluded }) => (
          <Tr key={skill.id}>
            {onUsedChange != null && (
              <Td dataLabel={usedColumn} modifier="fitContent">
                <Checkbox
                  id={`skills-table-use-${skill.id}`}
                  aria-label={t("agentic.skillsTable.useSkill", {
                    name: skill.name,
                  })}
                  isChecked={!excluded}
                  onChange={(_event, checked) => onUsedChange(skill, checked)}
                />
              </Td>
            )}
            <Td dataLabel={skillColumn}>
              {excluded && onUsedChange == null ? (
                <Flex
                  spaceItems={{ default: "spaceItemsSm" }}
                  alignItems={{ default: "alignItemsCenter" }}
                >
                  <FlexItem>{skillName(skill)}</FlexItem>
                  <FlexItem>
                    <Label variant="outline" isCompact>
                      {t("agentic.skillsTable.excluded")}
                    </Label>
                  </FlexItem>
                </Flex>
              ) : (
                skillName(skill)
              )}
            </Td>
            <Td dataLabel={sourceColumn}>
              <SkillSources sources={sources} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};
