import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Flex,
  FlexItem,
  FormGroup,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextArea,
  TextInput,
  Tooltip,
} from "@patternfly/react-core";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@patternfly/react-icons";

import { Agent, EntityId } from "@app/agentic";

export interface StageFormData {
  /** Server id of an existing stage; undefined for a stage added in the form. */
  id?: EntityId;
  name: string;
  agentId: EntityId | null;
  instructions: string;
  requiresApproval: boolean;
  order: number;
}

interface StageCardProps {
  stage: StageFormData;
  agents: Agent[];
  onChange: (updated: StageFormData) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export const StageCard: React.FC<StageCardProps> = ({
  stage,
  agents,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canRemove,
  canMoveUp,
  canMoveDown,
}) => {
  const { t } = useTranslation();
  const [isAgentSelectOpen, setIsAgentSelectOpen] = React.useState(false);

  const selectedAgent = agents.find((a) => a.id === stage.agentId);
  const stageLabel = stage.name || t("agentic.plan.untitledStage");

  return (
    <Card isCompact>
      <CardHeader
        actions={{
          actions: (
            <>
              <Tooltip
                content={t("agentic.plan.moveStageUp", { stage: stageLabel })}
              >
                <Button
                  variant="plain"
                  aria-label={t("agentic.plan.moveStageUp", {
                    stage: stageLabel,
                  })}
                  onClick={onMoveUp}
                  isDisabled={!canMoveUp}
                  icon={<ArrowUpIcon />}
                />
              </Tooltip>
              <Tooltip
                content={t("agentic.plan.moveStageDown", {
                  stage: stageLabel,
                })}
              >
                <Button
                  variant="plain"
                  aria-label={t("agentic.plan.moveStageDown", {
                    stage: stageLabel,
                  })}
                  onClick={onMoveDown}
                  isDisabled={!canMoveDown}
                  icon={<ArrowDownIcon />}
                />
              </Tooltip>
              <Tooltip
                content={t("agentic.plan.removeStage", { stage: stageLabel })}
              >
                <Button
                  variant="plain"
                  aria-label={t("agentic.plan.removeStage", {
                    stage: stageLabel,
                  })}
                  onClick={onRemove}
                  isDisabled={!canRemove}
                  icon={<TrashIcon />}
                />
              </Tooltip>
            </>
          ),
          hasNoOffset: true,
        }}
      >
        <CardTitle>
          <Flex
            spaceItems={{ default: "spaceItemsSm" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem>
              <Label isCompact>
                {t("agentic.plan.stageNumber", { number: stage.order })}
              </Label>
            </FlexItem>
            <FlexItem>{stageLabel}</FlexItem>
          </Flex>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <FormGroup
          label={t("agentic.plan.stageName")}
          isRequired
          fieldId={`stage-name-${stage.order}`}
        >
          <TextInput
            id={`stage-name-${stage.order}`}
            value={stage.name}
            onChange={(_event, value) => onChange({ ...stage, name: value })}
            placeholder={t("agentic.plan.stageNamePlaceholder")}
          />
        </FormGroup>
        <FormGroup
          label={t("agentic.plan.agent")}
          isRequired
          fieldId={`stage-agent-${stage.order}`}
          className="pf-v6-u-mt-md"
        >
          <Select
            id={`stage-agent-${stage.order}`}
            // Inline, so the menu stays inside the modal (PF marks the rest of
            // <body> aria-hidden while a modal is open).
            popperProps={{ appendTo: "inline" }}
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
                onClick={() => setIsAgentSelectOpen(!isAgentSelectOpen)}
                isExpanded={isAgentSelectOpen}
                isFullWidth
              >
                {selectedAgent?.name || t("agentic.plan.selectAgent")}
              </MenuToggle>
            )}
          >
            <SelectList>
              {agents.map((agent) => (
                <SelectOption key={agent.id} value={agent.id.toString()}>
                  {agent.name}
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </FormGroup>
        <FormGroup
          label={t("agentic.plan.instructions")}
          fieldId={`stage-instructions-${stage.order}`}
          className="pf-v6-u-mt-md"
        >
          <TextArea
            id={`stage-instructions-${stage.order}`}
            value={stage.instructions}
            onChange={(_event, value) =>
              onChange({ ...stage, instructions: value })
            }
            placeholder={t("agentic.plan.instructionsPlaceholder")}
            rows={3}
          />
        </FormGroup>
        <FormGroup
          className="pf-v6-u-mt-md"
          fieldId={`stage-approval-${stage.order}`}
        >
          <Checkbox
            id={`stage-approval-${stage.order}`}
            label={t("agentic.plan.requiresApproval")}
            isChecked={stage.requiresApproval}
            onChange={(_event, checked) =>
              onChange({ ...stage, requiresApproval: checked })
            }
          />
        </FormGroup>
      </CardBody>
    </Card>
  );
};
