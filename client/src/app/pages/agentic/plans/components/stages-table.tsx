import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  Flex,
  FlexItem,
  Icon,
  Label,
  Skeleton,
  Tooltip,
} from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";
import {
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { Agent, EntityId, ModelProjection } from "@app/agentic";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";

/** One stage of a plan definition, saved or still in the wizard. */
export interface StagesTableRow {
  key: string;
  name: string;
  agentId: EntityId | null;
  /** The agent's name as the plan stores it, for when the agents query has no match. */
  agentName?: string;
  instructions: string;
  requiresApproval: boolean;
}

export interface StagesTableProps {
  rows: StagesTableRow[];
  /** Undefined while the agents query loads or after it failed. */
  agents: Agent[] | undefined;
  /** Undefined while the models query loads or after it failed. */
  models: ModelProjection[] | undefined;
  /** True while agents or models load: the Model cells show a skeleton. */
  isLoading: boolean;
  /** Agent names link to the agent; without it (wizard Review) they are plain text. */
  agentLinkTo?: (agentId: EntityId) => LocationDescriptor;
  "aria-label": string;
}

const INSTRUCTIONS_MAX_LINES = 8;

/** Prose split into paragraphs: no utility keeps line breaks (guide 4.11). */
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

/**
 * The stages of a migration plan definition (guide 7.3, plans amendment 3):
 * expand toggle · # · Stage (with "Requires approval") · Agent · Model, the
 * provider as a subtle second line and a warning marker when the model is
 * not verified. Rows expand to the stage instructions. Used by the plan
 * Details tab and the wizard Review; plan runs use `StageRunsTable`.
 */
export const StagesTable: React.FC<StagesTableProps> = ({
  rows,
  agents,
  models,
  isLoading,
  agentLinkTo,
  "aria-label": ariaLabel,
}) => {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([]);
  // The edit wizard's Review table renders over the Details one: ids stay unique.
  const expandId = `stage-instructions-${React.useId().replace(/:/g, "")}-`;
  const columns = {
    order: t("agentic.plan.stageOrderColumn"),
    stage: t("agentic.entity.stage"),
    agent: t("agentic.entity.agent"),
    model: t("agentic.plan.model"),
  };

  const modelCell = (row: StagesTableRow) => {
    if (isLoading) {
      return <Skeleton screenreaderText={t("terms.loading")} />;
    }
    const agent = agents?.find((candidate) => candidate.id === row.agentId);
    if (agent == null) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    const model = models?.find((candidate) => candidate.id === agent.model.id);
    const name = model?.name ?? agent.model.name;
    // Same rule as getStagesWithUnverifiedModel: a model the models query does not list is not verified either.
    const isUnverified =
      models != null && model?.verificationStatus !== "verified";
    const marker = t("agentic.plan.modelNotVerified", { model: name });
    return (
      <>
        <div>
          {name}
          {isUnverified && (
            <span className={textStyles.textNowrap}>
              {"\u00a0"}
              <Tooltip content={marker}>
                <Icon status="warning" aria-label={marker} isInline>
                  <ExclamationTriangleIcon />
                </Icon>
              </Tooltip>
            </span>
          )}
        </div>
        {model != null && (
          <Content component="small" className={textStyles.textColorSubtle}>
            {model.provider.name}
          </Content>
        )}
      </>
    );
  };

  const agentCell = (row: StagesTableRow) => {
    const name =
      agents?.find((candidate) => candidate.id === row.agentId)?.name ??
      row.agentName;
    if (row.agentId == null || name == null) {
      return <EmptyTextMessage message={t("agentic.common.unavailable")} />;
    }
    return agentLinkTo != null ? (
      <Link to={agentLinkTo(row.agentId)}>{name}</Link>
    ) : (
      name
    );
  };

  return (
    <Table aria-label={ariaLabel} variant="compact">
      <Thead>
        <Tr>
          <Th screenReaderText={t("agentic.plan.stageExpansion")} />
          <Th modifier="fitContent">{columns.order}</Th>
          <Th width={40}>{columns.stage}</Th>
          <Th>{columns.agent}</Th>
          <Th>{columns.model}</Th>
        </Tr>
      </Thead>
      {rows.map((row, rowIndex) => {
        const isExpanded = expandedKeys.includes(row.key);
        const instructions = paragraphs(row.instructions);
        return (
          <Tbody key={row.key} isExpanded={isExpanded}>
            <Tr>
              <Td
                expand={{
                  rowIndex,
                  isExpanded,
                  expandId,
                  onToggle: () =>
                    setExpandedKeys((keys) =>
                      isExpanded
                        ? keys.filter((key) => key !== row.key)
                        : [...keys, row.key]
                    ),
                }}
              />
              <Td dataLabel={columns.order}>{rowIndex + 1}</Td>
              <Td dataLabel={columns.stage}>
                {row.requiresApproval ? (
                  <Flex
                    spaceItems={{ default: "spaceItemsSm" }}
                    alignItems={{ default: "alignItemsCenter" }}
                  >
                    <FlexItem>{row.name}</FlexItem>
                    <FlexItem>
                      <Label variant="outline" isCompact>
                        {t("agentic.plan.requiresApproval")}
                      </Label>
                    </FlexItem>
                  </Flex>
                ) : (
                  row.name
                )}
              </Td>
              <Td dataLabel={columns.agent}>{agentCell(row)}</Td>
              <Td dataLabel={columns.model}>{modelCell(row)}</Td>
            </Tr>
            <Tr isExpanded={isExpanded}>
              <Td />
              <Td />
              <Td colSpan={3} dataLabel={t("agentic.plan.instructions")}>
                <ExpandableRowContent>
                  <DescriptionList isCompact>
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        {t("agentic.plan.instructions")}
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        {instructions.length > 0 ? (
                          // Long prose shows its first lines (guide 4.11).
                          <ExpandableSection
                            variant="truncate"
                            truncateMaxLines={INSTRUCTIONS_MAX_LINES}
                            toggleTextCollapsed={t("terms.showMore")}
                            toggleTextExpanded={t("terms.showLess")}
                          >
                            <Content>
                              {instructions.map((paragraph, index) => (
                                <Content component="p" key={index}>
                                  {paragraph}
                                </Content>
                              ))}
                            </Content>
                          </ExpandableSection>
                        ) : (
                          <EmptyTextMessage message={t("terms.none")} />
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </ExpandableRowContent>
              </Td>
            </Tr>
          </Tbody>
        );
      })}
    </Table>
  );
};
