import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  ExpandableSectionVariant,
  Label,
  LabelGroup,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import { Agent, EntityRef, Gateway, MigrationPlan } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { ConditionalTableBody } from "@app/components/TableControls";
import { BreadcrumbEntry, breadcrumbTo } from "@app/hooks/useBreadcrumbs";
import { formatDate } from "@app/utils/utils";

import { AgentModel } from "../components/agent-model";

import { DetailSection, DetailSections, SectionEmpty } from "./detail-section";

export interface AgentDetailsTabProps {
  agent: Agent;
  /** The agent's model record, once the models query has it. */
  gateway?: Gateway;
  /** The models query failed, so the model's provider and status are unknown. */
  isGatewayUnavailable?: boolean;
  /** The models query is still loading. */
  isGatewayLoading?: boolean;
  /** Plans with a stage assigned to the agent; read only once the plans query succeeded. */
  plansUsingAgent: MigrationPlan[];
  isLoadingPlans: boolean;
  plansError: unknown;
  /** The agent page's trail, so its links come back here. */
  linkCrumbs: BreadcrumbEntry[];
}

/**
 * The Details tab (guide 4.2, 7.2, kit-detail): the facts, then the
 * Persona prompt, Parameters and Used in migration plans sections.
 */
export const AgentDetailsTab: React.FC<AgentDetailsTabProps> = ({
  agent,
  gateway,
  isGatewayUnavailable,
  isGatewayLoading,
  plansUsingAgent,
  isLoadingPlans,
  plansError,
  linkCrumbs,
}) => {
  const { t } = useTranslation();
  const origin = `?from=agent-${agent.id}`;
  const linkTo = (pathname: string) =>
    breadcrumbTo(pathname, origin, linkCrumbs);
  const none = <EmptyTextMessage message={t("terms.none")} />;
  const unavailable = (
    <EmptyTextMessage message={t("agentic.common.unavailable")} />
  );
  const collections = agent.skillCollections ?? [];

  /** A set-valued fact: link labels, even for one item (C2). */
  const linkLabels = (refs: EntityRef[], pathOf: (id: string) => string) =>
    refs.length === 0 ? (
      none
    ) : (
      <LabelGroup numLabels={5}>
        {refs.map((ref) => (
          <Label
            key={ref.id}
            variant="outline"
            isCompact
            isClickable
            render={({ className, content }) => (
              <Link className={className} to={linkTo(pathOf(ref.id))}>
                {content}
              </Link>
            )}
          >
            {ref.name}
          </Label>
        ))}
      </LabelGroup>
    );

  const facts: [string, React.ReactNode][] = [
    [
      t("agentic.agent.model"),
      <AgentModel
        key="model"
        model={agent.model}
        gateway={gateway}
        isGatewayUnavailable={isGatewayUnavailable}
        isGatewayLoading={isGatewayLoading}
        isInline
      />,
    ],
    [
      t("agentic.agent.skills"),
      linkLabels(agent.skills, (skillId) =>
        generatePath(DevPaths.skillDetails, { skillId })
      ),
    ],
    [
      t("agentic.agent.skillCollections"),
      collections.length === 0 ? (
        none
      ) : (
        <Stack>
          <StackItem>
            {linkLabels(collections, (collectionId) =>
              generatePath(DevPaths.skillCollectionDetails, { collectionId })
            )}
          </StackItem>
          <StackItem>
            <Content component="small" className={textStyles.textColorSubtle}>
              {t("agentic.agent.skillCollectionsHelp")}
            </Content>
          </StackItem>
        </Stack>
      ),
    ],
    [
      t("agentic.agent.capabilities"),
      agent.capabilities.length === 0 ? (
        none
      ) : (
        <LabelGroup numLabels={5}>
          {agent.capabilities.map((capability, index) => (
            <Label key={index} variant="outline" isCompact>
              {capability}
            </Label>
          ))}
        </LabelGroup>
      ),
    ],
    [
      t("agentic.agentDetail.createdAt"),
      agent.createTime ? formatDate(new Date(agent.createTime)) : unavailable,
    ],
    [
      t("agentic.agentDetail.updatedAt"),
      agent.updateTime ? formatDate(new Date(agent.updateTime)) : unavailable,
    ],
  ];

  // Prose, one paragraph per line, never monospace (4.11).
  const promptParagraphs = agent.prompt
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const plans = [...plansUsingAgent].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasPlans = !isLoadingPlans && plansError == null;

  return (
    <DetailSections>
      <DescriptionList
        isHorizontal
        isCompact
        horizontalTermWidthModifier={{ default: "18ch" }}
      >
        {facts.map(([term, value]) => (
          <DescriptionListGroup key={term}>
            <DescriptionListTerm>{term}</DescriptionListTerm>
            <DescriptionListDescription>{value}</DescriptionListDescription>
          </DescriptionListGroup>
        ))}
      </DescriptionList>

      <DetailSection title={t("agentic.agent.personaPrompt")}>
        {promptParagraphs.length === 0 ? (
          <SectionEmpty>
            {t("agentic.agentDetail.noPersonaPrompt")}
          </SectionEmpty>
        ) : (
          // A long prompt shows its first lines with Show more (4.11).
          <ExpandableSection
            variant={ExpandableSectionVariant.truncate}
            truncateMaxLines={8}
            toggleTextCollapsed={t("terms.showMore")}
            toggleTextExpanded={t("terms.showLess")}
          >
            <Content>
              {promptParagraphs.map((paragraph, index) => (
                <Content key={index} component="p">
                  {paragraph}
                </Content>
              ))}
            </Content>
          </ExpandableSection>
        )}
      </DetailSection>

      <DetailSection title={t("agentic.agent.parameters")}>
        {agent.parameters.length === 0 ? (
          <SectionEmpty>{t("agentic.agentDetail.noParameters")}</SectionEmpty>
        ) : (
          <Table aria-label={t("agentic.agent.parameters")} variant="compact">
            <Thead>
              <Tr>
                <Th width={20}>{t("terms.name")}</Th>
                <Th modifier="fitContent">
                  {t("agentic.agent.parameterType")}
                </Th>
                <Th modifier="fitContent">
                  {t("agentic.agentDetail.parameterDefault")}
                </Th>
                <Th>{t("terms.description")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {agent.parameters.map((parameter) => (
                <Tr key={parameter.name}>
                  <Td dataLabel={t("terms.name")}>
                    <span className={textStyles.fontFamilyMonospace}>
                      {parameter.name}
                    </span>
                  </Td>
                  <Td dataLabel={t("agentic.agent.parameterType")}>
                    {t(`agentic.agent.parameterTypes.${parameter.type}`)}
                  </Td>
                  <Td
                    modifier="nowrap"
                    dataLabel={t("agentic.agentDetail.parameterDefault")}
                  >
                    {parameter.defaultValue ? (
                      <span className={textStyles.fontFamilyMonospace}>
                        {parameter.defaultValue}
                      </span>
                    ) : (
                      none
                    )}
                  </Td>
                  <Td dataLabel={t("terms.description")}>
                    {parameter.description || none}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </DetailSection>

      <DetailSection
        title={
          hasPlans && plans.length > 0
            ? t("agentic.agentDetail.usedInPlansCount", { count: plans.length })
            : t("agentic.agentDetail.usedInPlans")
        }
      >
        {hasPlans && plans.length === 0 ? (
          <SectionEmpty>{t("agentic.agentDetail.notUsedInPlans")}</SectionEmpty>
        ) : (
          <Table
            aria-label={t("agentic.agentDetail.usedInPlans")}
            variant="compact"
          >
            <Thead>
              <Tr>
                <Th width={40}>{t("agentic.entity.migrationPlan")}</Th>
                <Th>{t("agentic.agentDetail.stagesLabel")}</Th>
              </Tr>
            </Thead>
            {/* The plans are a second query: a spinner or the error, never a false empty (X6). */}
            <ConditionalTableBody
              isLoading={isLoadingPlans}
              isError={plansError != null}
              isNoData={false}
              numRenderedColumns={2}
            >
              <Tbody>
                {plans.map((plan) => (
                  <Tr key={plan.id}>
                    <Td dataLabel={t("agentic.entity.migrationPlan")}>
                      <Link
                        to={linkTo(
                          generatePath(DevPaths.migrationPlanDetails, {
                            planId: plan.id,
                          })
                        )}
                      >
                        {plan.name}
                      </Link>
                    </Td>
                    <Td dataLabel={t("agentic.agentDetail.stagesLabel")}>
                      {[...plan.stages]
                        .sort((a, b) => a.order - b.order)
                        .filter((stage) => stage.agent?.id === agent.id)
                        .map((stage) => stage.name)
                        .join(", ")}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </ConditionalTableBody>
          </Table>
        )}
      </DetailSection>
    </DetailSections>
  );
};
