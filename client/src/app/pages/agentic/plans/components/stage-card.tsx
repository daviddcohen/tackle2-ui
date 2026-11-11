import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardBody,
  CardExpandableContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Content,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextArea,
  TextInput,
  Tooltip,
} from "@patternfly/react-core";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MinusCircleIcon,
} from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { Agent, EntityId, ModelProjection } from "@app/agentic";

import { useAgentSkillsSummary } from "../../agents/agent-skills-summary";

export interface StageFormData {
  /** Server id of an existing stage; undefined for a stage added in the form. */
  id?: EntityId;
  /** Stable while the wizard is open (React key and expansion); never sent. */
  formKey: string;
  name: string;
  agentId: EntityId | null;
  instructions: string;
  requiresApproval: boolean;
  order: number;
}

export interface StageCardProps {
  stage: StageFormData;
  /** Undefined while the agents query loads or after it failed. */
  agents: Agent[] | undefined;
  isLoadingAgents: boolean;
  /** Undefined while the models query loads or after it failed (no provider or marker then). */
  models: ModelProjection[] | undefined;
  isExpanded: boolean;
  onExpand: () => void;
  onChange: (updated: StageFormData) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The modal box the agent menu is appended to, so the card does not clip it (addenda P12). */
  menuAppendTo: () => HTMLElement;
}

/**
 * One stage of the plan wizard (guide 4.5, plans amendment 2): an expandable
 * compact card whose header names the stage ("Stage 1: Prepare proposal"),
 * marks "Requires approval", says which agent runs it while collapsed, and
 * holds plain Move up, Move down and Remove buttons.
 */
export const StageCard: React.FC<StageCardProps> = ({
  stage,
  agents,
  isLoadingAgents,
  models,
  isExpanded,
  onExpand,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canRemove,
  canMoveUp,
  canMoveDown,
  menuAppendTo,
}) => {
  const { t } = useTranslation();
  const [isAgentSelectOpen, setIsAgentSelectOpen] = React.useState(false);
  const idPrefix = `stage-${stage.formKey}`;

  const selectedAgent = agents?.find((agent) => agent.id === stage.agentId);
  const selectedModel = models?.find(
    (model) => model.id === selectedAgent?.model.id
  );
  const title = stage.name.trim()
    ? t("agentic.plan.stageTitle", {
        number: stage.order,
        stage: stage.name.trim(),
      })
    : t("agentic.plan.stageNumber", { number: stage.order });
  const stageLabel =
    stage.name.trim() || t("agentic.plan.stageNumber", { number: stage.order });

  const sortedAgents = [...(agents ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const agentSkillsSummary = useAgentSkillsSummary();
  const skillsSummary = (agent: Agent) =>
    agentSkillsSummary(agent) ?? t("terms.none");
  const modelName = (agent: Agent) =>
    models?.find((model) => model.id === agent.model.id)?.name ??
    agent.model.name;

  const agentHelper = isLoadingAgents ? (
    <HelperTextItem>{t("agentic.plan.loadingAgents")}</HelperTextItem>
  ) : agents == null ? (
    <HelperTextItem variant="error">
      {t("agentic.plan.agentsLoadFailed")}
    </HelperTextItem>
  ) : selectedAgent == null ? (
    <HelperTextItem>{t("agentic.plan.agentHelper")}</HelperTextItem>
  ) : models != null && selectedModel?.verificationStatus !== "verified" ? (
    // A model the models query does not list is not verified either (getStagesWithUnverifiedModel).
    <HelperTextItem variant="warning">
      {t("agentic.plan.agentModelNotVerified", {
        agent: selectedAgent.name,
        model: modelName(selectedAgent),
      })}
    </HelperTextItem>
  ) : (
    <HelperTextItem>
      {selectedModel != null
        ? t("agentic.plan.agentUsesModel", {
            agent: selectedAgent.name,
            model: selectedModel.name,
            provider: selectedModel.provider.name,
          })
        : t("agentic.plan.agentUsesModelNoProvider", {
            agent: selectedAgent.name,
            model: selectedAgent.model.name,
          })}
    </HelperTextItem>
  );

  const moveUpLabel = t("agentic.plan.moveStageUp", { stage: stageLabel });
  const moveDownLabel = t("agentic.plan.moveStageDown", { stage: stageLabel });
  const removeLabel = t("agentic.plan.removeStage", { stage: stageLabel });

  return (
    <Card isCompact isExpanded={isExpanded} id={`${idPrefix}-card`}>
      <CardHeader
        onExpand={onExpand}
        toggleButtonProps={{
          id: `${idPrefix}-toggle`,
          "aria-label": t("agentic.plan.stageDetails", { stage: title }),
          "aria-expanded": isExpanded,
        }}
        actions={{
          actions: (
            <Flex
              spaceItems={{ default: "spaceItemsNone" }}
              flexWrap={{ default: "nowrap" }}
            >
              <Tooltip content={moveUpLabel}>
                <Button
                  variant="plain"
                  aria-label={moveUpLabel}
                  onClick={onMoveUp}
                  isDisabled={!canMoveUp}
                  icon={<ArrowUpIcon />}
                />
              </Tooltip>
              <Tooltip content={moveDownLabel}>
                <Button
                  variant="plain"
                  aria-label={moveDownLabel}
                  onClick={onMoveDown}
                  isDisabled={!canMoveDown}
                  icon={<ArrowDownIcon />}
                />
              </Tooltip>
              <Tooltip content={removeLabel}>
                <Button
                  variant="plain"
                  aria-label={removeLabel}
                  onClick={onRemove}
                  isDisabled={!canRemove}
                  icon={<MinusCircleIcon />}
                />
              </Tooltip>
            </Flex>
          ),
          hasNoOffset: true,
        }}
      >
        <CardTitle>
          <Flex
            spaceItems={{ default: "spaceItemsSm" }}
            alignItems={{ default: "alignItemsCenter" }}
            flexWrap={{ default: "nowrap" }}
          >
            <FlexItem>{title}</FlexItem>
            {stage.requiresApproval && (
              <FlexItem>
                <Label
                  variant="outline"
                  isCompact
                  className={textStyles.fontWeightNormal}
                >
                  {t("agentic.plan.requiresApproval")}
                </Label>
              </FlexItem>
            )}
          </Flex>
        </CardTitle>
        {!isExpanded && selectedAgent != null && (
          <Content component="small" className={textStyles.textColorSubtle}>
            {t("agentic.plan.runBy", { agent: selectedAgent.name })}
          </Content>
        )}
        {/* A closed card still says why Next is disabled (addenda P8). */}
        {!isExpanded && agents == null && (
          <HelperText>{agentHelper}</HelperText>
        )}
      </CardHeader>
      <CardExpandableContent>
        <CardBody>
          <Form onSubmit={(event) => event.preventDefault()}>
            <FormGroup
              label={t("agentic.plan.stageName")}
              isRequired
              fieldId={`${idPrefix}-name`}
            >
              <TextInput
                id={`${idPrefix}-name`}
                isRequired
                value={stage.name}
                onChange={(_event, value) =>
                  onChange({ ...stage, name: value })
                }
              />
            </FormGroup>
            <FormGroup
              label={t("agentic.entity.agent")}
              isRequired
              fieldId={`${idPrefix}-agent`}
            >
              <Select
                id={`${idPrefix}-agent-select`}
                popperProps={{ appendTo: menuAppendTo }}
                isScrollable
                maxMenuHeight="16rem"
                isOpen={isAgentSelectOpen}
                onOpenChange={setIsAgentSelectOpen}
                selected={stage.agentId ?? undefined}
                onSelect={(_event, value) => {
                  onChange({ ...stage, agentId: String(value) });
                  setIsAgentSelectOpen(false);
                }}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    id={`${idPrefix}-agent`}
                    onClick={() => setIsAgentSelectOpen(!isAgentSelectOpen)}
                    isExpanded={isAgentSelectOpen}
                    isDisabled={agents == null}
                    isFullWidth
                  >
                    {selectedAgent?.name ?? t("agentic.plan.selectAgent")}
                  </MenuToggle>
                )}
              >
                <SelectList aria-label={t("agentic.plan.agentsList")}>
                  {sortedAgents.map((agent) => (
                    <SelectOption
                      key={agent.id}
                      value={agent.id}
                      description={t("agentic.plan.agentOption", {
                        model: modelName(agent),
                        skills: skillsSummary(agent),
                      })}
                    >
                      {agent.name}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
              <FormHelperText>
                <HelperText>{agentHelper}</HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup
              label={t("agentic.plan.instructions")}
              fieldId={`${idPrefix}-instructions`}
            >
              <TextArea
                id={`${idPrefix}-instructions`}
                value={stage.instructions}
                onChange={(_event, value) =>
                  onChange({ ...stage, instructions: value })
                }
                rows={3}
                resizeOrientation="vertical"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t("agentic.plan.instructionsHelper")}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <Checkbox
              id={`${idPrefix}-approval`}
              label={t("agentic.plan.requireApproval")}
              description={t("agentic.plan.requireApprovalDescription")}
              isChecked={stage.requiresApproval}
              onChange={(_event, checked) =>
                onChange({ ...stage, requiresApproval: checked })
              }
            />
          </Form>
        </CardBody>
      </CardExpandableContent>
    </Card>
  );
};
