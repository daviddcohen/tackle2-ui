import * as React from "react";
import { LocationDescriptor } from "history";
import { Trans, useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Content,
  Flex,
  FlexItem,
  Label,
  Skeleton,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  Agent,
  EntityRef,
  Skill,
  SkillAssociationScope,
  SkillCollection,
  SkillPlacement,
  SkillPlan,
} from "@app/agentic";
import { Archetype } from "@app/api/models";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { ConditionalTableBody } from "@app/components/TableControls";
import {
  SkillLinkTo,
  SkillOriginList,
  linkToPath,
} from "@app/pages/agentic/components/skill-origin";
import { skillAssociationPath } from "@app/pages/agentic/entity-paths";
import { isResolveEndpointMissing } from "@app/queries/agentic";

import { CountLink } from "../../components/count-link";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  LinkLabelItem,
  LinkLabels,
} from "../../components/detail-section";
import {
  USED_BY_AGENTS_ID,
  getAgentsUsingCollection,
  getSkillAssociationRows,
} from "../skill-usage";

/** Names the "Attached to" section (a region), for links and tests. */
const ATTACHED_TO_HEADING_ID = "skill-attached-to-heading";

/** The facts of "Attached to", one per type, always all four (stable layout). */
const ATTACHED_TO_FACTS: [SkillAssociationScope, string][] = [
  ["agent", "agentic.skillDetail.attachedAgents"],
  ["archetype", "agentic.skillDetail.attachedArchetypes"],
  ["targetProfile", "agentic.skillDetail.attachedTargetProfiles"],
  ["application", "agentic.skillDetail.attachedApplications"],
];

export interface SkillUsageTabProps {
  skill: Skill;
  archetypes: Archetype[];
  isLoadingArchetypes: boolean;
  /** Undefined while loading or after a failure: unknown, not empty. */
  collections: SkillCollection[] | undefined;
  isLoadingCollections: boolean;
  isCollectionsError: boolean;
  /** Undefined while loading or after a failure. */
  agents: Agent[] | undefined;
  plans: SkillPlan[] | undefined;
  isLoadingPlans: boolean;
  plansError: unknown;
  /**
   * Builds a link with this page's breadcrumb trail; `search` is the target's
   * own query and hash.
   */
  linkTo: SkillLinkTo;
  /**
   * The same, plus `?from=` this skill (for entity pages that read it), then
   * an optional `#hash`.
   */
  childLinkTo: (path: string, hash?: string) => LocationDescriptor;
}

/**
 * The skill page's Usage tab: what the skill is attached to (a
 * facts list), the skill collections it is in, and the migration plans whose
 * stages get it, one row per plan and stage.
 */
export const SkillUsageTab: React.FC<SkillUsageTabProps> = (props) => (
  <DetailSections>
    <AttachedToSection
      skill={props.skill}
      archetypes={props.archetypes}
      isLoadingArchetypes={props.isLoadingArchetypes}
      linkTo={props.linkTo}
    />
    <InCollectionsSection
      collections={props.collections}
      isLoading={props.isLoadingCollections}
      isError={props.isCollectionsError}
      agents={props.agents}
      childLinkTo={props.childLinkTo}
    />
    <UsedInPlansSection
      skill={props.skill}
      plans={props.plans}
      isLoading={props.isLoadingPlans}
      error={props.plansError}
      linkTo={props.linkTo}
      childLinkTo={props.childLinkTo}
    />
  </DetailSections>
);

const AttachedToSection: React.FC<{
  skill: Skill;
  archetypes: Archetype[];
  isLoadingArchetypes: boolean;
  linkTo: SkillLinkTo;
}> = ({ skill, archetypes, isLoadingArchetypes, linkTo }) => {
  const { t } = useTranslation();
  const associations = skill.associations;
  const count = associations?.length ?? 0;

  let content: React.ReactNode;
  if (associations == null) {
    content = <EmptyTextMessage message={t("agentic.common.unavailable")} />;
  } else if (count === 0) {
    content = (
      // Left-aligned like the tab's other empty sentences.
      <Content component="p">{t("agentic.skillDetail.notAttached")}</Content>
    );
  } else {
    const rows = getSkillAssociationRows(t, associations, archetypes);
    content = (
      <DetailFacts
        facts={ATTACHED_TO_FACTS.map(([scope, term]) => {
          const items: LinkLabelItem[] = rows
            .filter((row) => row.association.scope === scope)
            .map(({ association, name }) => {
              // A target profile whose archetype is unknown has no page.
              const path = skillAssociationPath(association, archetypes);
              return {
                id: `${association.scope}-${association.resource.id}`,
                name,
                to: path != null ? linkToPath(linkTo, path) : undefined,
              };
            });
          // Target profile names and links wait for the archetypes.
          const value =
            scope === "targetProfile" &&
            items.length > 0 &&
            isLoadingArchetypes ? (
              <Skeleton
                key={scope}
                width="12rem"
                screenreaderText={t("terms.loading")}
              />
            ) : items.length > 0 ? (
              <LinkLabels key={scope} items={items} />
            ) : (
              <EmptyTextMessage key={scope} message={t("terms.none")} />
            );
          return [t(term), value];
        })}
      />
    );
  }

  return (
    <DetailSection
      headingId={ATTACHED_TO_HEADING_ID}
      title={
        count > 0
          ? t("agentic.skillDetail.attachedToTitle", { count })
          : t("agentic.skillDetail.attachedTo")
      }
      description={t("agentic.skillDetail.attachedToDescription")}
    >
      {content}
    </DetailSection>
  );
};

const InCollectionsSection: React.FC<{
  collections: SkillCollection[] | undefined;
  isLoading: boolean;
  isError: boolean;
  agents: Agent[] | undefined;
  childLinkTo: (path: string, hash?: string) => LocationDescriptor;
}> = ({ collections, isLoading, isError, agents, childLinkTo }) => {
  const { t } = useTranslation();
  const hasRows = collections != null && collections.length > 0;
  const collectionPath = (id: string) =>
    generatePath(DevPaths.skillCollectionDetails, { collectionId: id });

  const agentsCell = (collection: SkillCollection) => {
    if (agents == null)
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    const using = getAgentsUsingCollection(collection.id, agents);
    if (using.length === 0)
      return <EmptyTextMessage message={t("terms.none")} />;
    if (using.length === 1)
      return (
        <Link
          to={childLinkTo(
            generatePath(DevPaths.agentDetails, { agentId: using[0].id })
          )}
        >
          {using[0].name}
        </Link>
      );
    return (
      <CountLink
        to={childLinkTo(collectionPath(collection.id), `#${USED_BY_AGENTS_ID}`)}
      >
        {t("agentic.skillCollection.agentCount", { count: using.length })}
      </CountLink>
    );
  };

  return (
    <DetailSection
      title={
        hasRows
          ? t("agentic.skillDetail.inCollectionsTitle", {
              count: collections.length,
            })
          : t("agentic.skillDetail.inCollections")
      }
      // Only above rows: an empty section is its heading and empty state.
      description={
        hasRows ? t("agentic.skillDetail.inCollectionsDescription") : undefined
      }
    >
      {collections != null && collections.length === 0 ? (
        <Content component="p">
          {t("agentic.skillDetail.notInAnyCollection")}
        </Content>
      ) : (
        <Table
          aria-label={t("agentic.skillDetail.inCollections")}
          variant="compact"
        >
          <Thead>
            <Tr>
              <Th width={30}>{t("agentic.entity.skillCollection")}</Th>
              <Th>{t("agentic.skillDetail.collectionAgents")}</Th>
            </Tr>
          </Thead>
          <ConditionalTableBody
            isLoading={isLoading}
            isError={isError}
            numRenderedColumns={2}
          >
            <Tbody>
              {(collections ?? []).map((collection) => (
                <Tr key={collection.id}>
                  <Td dataLabel={t("agentic.entity.skillCollection")}>
                    <Link to={childLinkTo(collectionPath(collection.id))}>
                      {collection.name}
                    </Link>
                  </Td>
                  <Td dataLabel={t("agentic.skillDetail.collectionAgents")}>
                    {agentsCell(collection)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ConditionalTableBody>
        </Table>
      )}
    </DetailSection>
  );
};

/** Numbered stages in order, then "Every stage" (no `stage`). */
const placementOrder = (placement: SkillPlacement) =>
  placement.stage?.order ?? Number.MAX_SAFE_INTEGER;

/** The agent that runs a stage, from the origins that name it. */
const stageAgent = (placement: SkillPlacement): EntityRef | undefined => {
  for (const origin of placement.from) {
    if (origin.kind === "agent" || origin.kind === "collection")
      return origin.agent;
  }
  return undefined;
};

const UsedInPlansSection: React.FC<{
  skill: Skill;
  plans: SkillPlan[] | undefined;
  isLoading: boolean;
  error: unknown;
  linkTo: SkillLinkTo;
  childLinkTo: (path: string) => LocationDescriptor;
}> = ({ skill, plans, isLoading, error, linkTo, childLinkTo }) => {
  const { t } = useTranslation();
  const count = plans?.length;
  // Application attachments reach a plan only when it runs, so the list
  // cannot show them: the empty sentence says so.
  const isAttachedToApplications =
    skill.associations?.some(
      (association) => association.scope === "application"
    ) ?? false;

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <Skeleton
        width="16rem"
        screenreaderText={t("agentic.plan.loadingPlans")}
      />
    );
  } else if (plans == null) {
    content = (
      <EmptyTextMessage
        message={
          isResolveEndpointMissing(error)
            ? t("agentic.skillDetail.plansNotAvailable")
            : t("agentic.common.unavailable")
        }
      />
    );
  } else if (plans.length === 0) {
    // One left-aligned sentence under the section description, as the
    // attached lists say they are empty.
    content = (
      <Content component="p">
        {isAttachedToApplications
          ? t("agentic.skillDetail.noPlansApplicationsOnly")
          : t("agentic.skillDetail.noPlans")}
      </Content>
    );
  } else {
    const planHeader = t("agentic.entity.migrationPlan");
    const stageHeader = t("agentic.skillDetail.stage");
    const fromHeader = t("agentic.stageSkills.from");
    content = (
      <Table
        aria-label={t("agentic.skillDetail.usedInPlans")}
        variant="compact"
      >
        <Thead>
          <Tr>
            <Th width={30}>{planHeader}</Th>
            <Th width={30}>{stageHeader}</Th>
            <Th>{fromHeader}</Th>
          </Tr>
        </Thead>
        {plans.map(({ plan, placements }) => {
          const planLink = (
            <Link
              to={childLinkTo(
                generatePath(DevPaths.migrationPlanDetails, {
                  planId: String(plan.id),
                })
              )}
            >
              {plan.name}
            </Link>
          );
          const rows = [...placements].sort(
            (a, b) => placementOrder(a) - placementOrder(b)
          );
          return (
            <Tbody key={plan.id}>
              {rows.map((placement, index) => {
                const agent =
                  placement.stage != null ? stageAgent(placement) : undefined;
                return (
                  <Tr
                    key={placement.stage?.order ?? "every-stage"}
                    // Under a spanned plan cell the Stage cell comes first:
                    // PF's reset keeps it aligned with the Stage column.
                    resetOffset={index > 0}
                  >
                    {/* The plan cell spans its rows: an Every stage row
                        is visibly one of its plan's rows, not a row with
                        no plan. */}
                    {index === 0 && (
                      <Td dataLabel={planHeader} rowSpan={rows.length}>
                        {planLink}
                      </Td>
                    )}
                    <Td dataLabel={stageHeader}>
                      <Flex
                        spaceItems={{ default: "spaceItemsSm" }}
                        alignItems={{ default: "alignItemsCenter" }}
                      >
                        <FlexItem>
                          {placement.stage == null
                            ? t("agentic.stageSkills.everyStage")
                            : placement.stage.name
                              ? t("agentic.plan.stageTitle", {
                                  number: placement.stage.order,
                                  stage: placement.stage.name,
                                })
                              : t("agentic.plan.stageNumber", {
                                  number: placement.stage.order,
                                })}
                        </FlexItem>
                        {placement.excluded && (
                          <FlexItem>
                            <Label variant="outline" isCompact>
                              {t("agentic.skillsTable.excluded")}
                            </Label>
                          </FlexItem>
                        )}
                      </Flex>
                      {agent != null && (
                        <Content
                          component="small"
                          className={textStyles.textColorSubtle}
                        >
                          <Trans
                            i18nKey="agentic.stageSkills.runBy"
                            values={{ agent: agent.name }}
                            components={{
                              agentLink: (
                                <Link
                                  to={childLinkTo(
                                    generatePath(DevPaths.agentDetails, {
                                      agentId: agent.id,
                                    })
                                  )}
                                />
                              ),
                            }}
                          />
                        </Content>
                      )}
                    </Td>
                    <Td dataLabel={fromHeader}>
                      <SkillOriginList
                        origins={placement.from}
                        linkTo={linkTo}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          );
        })}
      </Table>
    );
  }

  return (
    <DetailSection
      title={
        count
          ? t("agentic.skillDetail.usedInPlansTitle", { count })
          : t("agentic.skillDetail.usedInPlans")
      }
      // Also above the empty sentence: it says when application skills are
      // added. Not when the list could not be read.
      description={
        plans != null
          ? t("agentic.skillDetail.usedInPlansDescription")
          : undefined
      }
    >
      {content}
    </DetailSection>
  );
};
