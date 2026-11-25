import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { TFunction } from "i18next";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, generatePath } from "react-router-dom";
import { array, object, string } from "yup";
import {
  Button,
  Form,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import { Agent, EntityId, Skill, SkillCollection } from "@app/agentic";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  useFetchAgents,
  useFetchSkillCollections,
  useFetchSkills,
  useStartAgentTestRunMutation,
} from "@app/queries/agentic";
import { useFetchApplications } from "@app/queries/applications";
import { getAxiosErrorMessage } from "@app/utils/utils";

import {
  PICKER_MENU_HEIGHT,
  PICKER_MENU_POPPER,
} from "../../components/picker-menu";

const AGENT_HELPER_ID = "agent-test-agent-helper";
const ADDED_SKILLS_ID = "agent-test-added-skills";
const ADDED_SKILLS_HELPER_ID = `${ADDED_SKILLS_ID}-input-helper`;

/**
 * What the test starts from: an agent (Agents list, agent page), or a skill
 * to try on an agent the user picks (skill page).
 */
export type AgentTestTarget = { agent: Agent } | { skill: Skill };

interface AgentTestModalProps {
  /** Closed when null. */
  target: AgentTestTarget | null;
  onClose: () => void;
}

interface FormValues {
  agentId: string;
  applicationId: string;
  task: string;
  addedSkillIds: string[];
}

const targetKey = (target: AgentTestTarget) =>
  "agent" in target ? `agent-${target.agent.id}` : `skill-${target.skill.id}`;

/**
 * The form lives in a child keyed by the target, so each opening (and each
 * agent or skill) starts from a fresh form instead of the previous input.
 */
export const AgentTestModal: React.FC<AgentTestModalProps> = ({
  target,
  onClose,
}) => (
  <Modal isOpen={target != null} onClose={onClose} variant="medium">
    {target != null && (
      <AgentTestModalContent
        key={targetKey(target)}
        target={target}
        onClose={onClose}
      />
    )}
  </Modal>
);

/**
 * Why each skill the agent already has is not offered again: its own
 * skills, then the skills of its skill collections. Unknown collections
 * (not loaded) add nothing; the controller ignores a skill reached twice.
 */
const includedSkillReasons = (
  agent: Agent,
  collections: SkillCollection[],
  t: TFunction
) => {
  const reasons = new Map<EntityId, string>();
  agent.skills.forEach((skill) =>
    reasons.set(skill.id, t("agentic.agent.testSkillIncludedDirect"))
  );
  (agent.skillCollections ?? []).forEach((ref) => {
    const collection = collections.find((c) => c.id === ref.id);
    collection?.skills.forEach((skill) => {
      if (!reasons.has(skill.id)) {
        reasons.set(
          skill.id,
          t("agentic.agent.testSkillIncludedCollection", {
            collection: collection.name,
          })
        );
      }
    });
  });
  return reasons;
};

const AgentTestModalContent: React.FC<{
  target: AgentTestTarget;
  onClose: () => void;
}> = ({ target, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const targetSkill = "skill" in target ? target.skill : undefined;
  const isSkillMode = targetSkill != null;

  const { data: applications = [] } = useFetchApplications();
  const {
    agents,
    isLoading: isLoadingAgents,
    fetchError: agentsError,
  } = useFetchAgents({ enabled: isSkillMode });
  const {
    skills,
    isLoading: isLoadingSkills,
    fetchError: skillsError,
  } = useFetchSkills();
  const {
    skillCollections,
    isLoading: isLoadingCollections,
    fetchError: collectionsError,
  } = useFetchSkillCollections();
  // A failed collections read falls back to the agent's own skills.
  const knownCollections = React.useMemo(
    () => (collectionsError == null ? skillCollections : []),
    [collectionsError, skillCollections]
  );

  const schema = object({
    agentId: isSkillMode
      ? string().required(t("agentic.agent.testAgentRequired"))
      : string(),
    applicationId: string().required(
      t("agentic.agent.testApplicationRequired")
    ),
    task: string().trim().required(t("agentic.agent.testTaskRequired")),
    addedSkillIds: array(string().required()).required(),
  });
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      agentId: "",
      applicationId: "",
      task: "",
      addedSkillIds: targetSkill != null ? [targetSkill.id] : [],
    },
    mode: "onChange",
    resolver: yupResolver(schema),
  });
  const agentId = useWatch({ control, name: "agentId" });
  const addedSkillIds = useWatch({ control, name: "addedSkillIds" });

  const agent =
    "agent" in target
      ? target.agent
      : agents.find((candidate) => candidate.id === agentId);
  const includedReasons = React.useMemo(
    () =>
      agent != null
        ? includedSkillReasons(agent, knownCollections, t)
        : new Map<EntityId, string>(),
    [agent, knownCollections, t]
  );

  // The skills that can be offered. The skill this test started from is
  // known already, so it stays offered (and its chip keeps its name) while
  // the others load or when they fail to load.
  const isSkillsUnavailable = skillsError != null;
  const isSkillsLoading = isLoadingSkills || isLoadingCollections;
  const offeredSkills = React.useMemo(() => {
    if (isSkillsUnavailable) return targetSkill != null ? [targetSkill] : [];
    if (targetSkill != null && !skills.some((s) => s.id === targetSkill.id)) {
      return [...skills, targetSkill];
    }
    return skills;
  }, [isSkillsUnavailable, skills, targetSkill]);
  const hasNoSkills =
    !isSkillsLoading && !isSkillsUnavailable && offeredSkills.length === 0;
  const isAddedSkillsDisabled =
    isSkillsLoading || isSkillsUnavailable || hasNoSkills;

  // What is sent: offered skills the agent does not have yet.
  const isSelectable = React.useCallback(
    (skillId: EntityId) =>
      offeredSkills.some((skill) => skill.id === skillId) &&
      !includedReasons.has(skillId),
    [offeredSkills, includedReasons]
  );
  // A skill the chosen agent already has is hidden from the selection (its
  // option says why) but kept in the form, so choosing another agent that
  // lacks it brings it back.
  const selectedSkillIds = addedSkillIds.filter(isSelectable);

  const skillOptions = React.useMemo<FilterSelectOptionProps[]>(
    () =>
      [...offeredSkills]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((skill) => {
          const includedReason = includedReasons.get(skill.id);
          if (includedReason != null) {
            return {
              value: skill.id,
              label: skill.name,
              optionProps: {
                isAriaDisabled: true,
                // With checkboxes the menuitem role is on the list item, and
                // PF marks only the inner checkbox.
                "aria-disabled": true,
                description: includedReason,
              },
            };
          }
          // How agents use it comes first, as in Manage skills: an "Always
          // followed" skill lands in every prompt of the test.
          const policy = t(
            `agentic.skill.loadPolicy.${skill.loadPolicy ?? "skill"}`
          );
          return {
            value: skill.id,
            label: skill.name,
            optionProps: {
              description: skill.description
                ? t("agentic.skill.manageSkills.optionDescription", {
                    policy,
                    description: skill.description,
                  })
                : policy,
            },
          };
        }),
    [offeredSkills, includedReasons, t]
  );

  const agentOptions = React.useMemo<FilterSelectOptionProps[]>(
    () =>
      targetSkill == null
        ? []
        : [...agents]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
              optionProps: includedSkillReasons(
                candidate,
                knownCollections,
                t
              ).has(targetSkill.id)
                ? {
                    description: t("agentic.agent.testAgentHasSkill", {
                      skill: targetSkill.name,
                    }),
                  }
                : undefined,
            })),
    [agents, knownCollections, targetSkill, t]
  );

  const applicationOptions: FilterSelectOptionProps[] = applications.map(
    (application) => ({
      value: application.id.toString(),
      label: application.name,
    })
  );

  // The toast names the agent the run was started for, and links to its runs.
  const runsLink = useLinkComponent(
    agent != null
      ? `${generatePath(DevPaths.agentDetails, { agentId: agent.id })}?tab=runs`
      : undefined
  );
  const startRun = useStartAgentTestRunMutation(
    (run) => {
      // The new run's page needs its id; a run without a name or id falls
      // back to the agent's Runs tab.
      if (run.id == null || run.id === "" || !run.name) {
        pushNotification({
          title: t("agentic.agent.testQueued", { agent: agent?.name }),
          // The run is listed on the agent's Runs tab.
          message: (
            <Button variant="link" isInline component={runsLink}>
              {t("agentic.agent.viewRuns")}
            </Button>
          ),
          variant: "success",
        });
        onClose();
        return;
      }
      // The new run's own page. One link type per toast: the toast keeps
      // this element as it is.
      const runLocation = generatePath(DevPaths.agentTestRunDetails, {
        agentId: run.agent.id,
        runId: run.id,
      });
      const RunLink = React.forwardRef<HTMLAnchorElement, object>(
        function RunLink(props, ref) {
          return <Link {...props} ref={ref} to={runLocation} />;
        }
      );
      pushNotification({
        title: t("agentic.agent.testRunQueued", { name: run.name }),
        message: (
          <Button variant="link" isInline component={RunLink}>
            {t("agentic.agent.viewTestRun")}
          </Button>
        ),
        variant: "success",
      });
      onClose();
    },
    (error: AxiosError) => {
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      });
    }
  );

  const submit = (values: FormValues) => {
    if (agent == null) return;
    const added = values.addedSkillIds.filter(isSelectable);
    startRun.mutate({
      agentId: agent.id,
      applicationId: Number(values.applicationId),
      task: values.task.trim(),
      ...(added.length > 0 && { addedSkills: added.map((id) => ({ id })) }),
    });
  };

  // From a skill, with an agent that already has it: it adds nothing.
  const isTargetSkillIncluded =
    targetSkill != null && includedReasons.has(targetSkill.id);
  const targetSkillIncludedHelper = isTargetSkillIncluded && (
    <HelperTextItem>
      {t("agentic.agent.testTargetSkillIncluded", {
        agent: agent?.name,
        skill: targetSkill.name,
      })}
    </HelperTextItem>
  );
  const addedSkillsHelper = isSkillsUnavailable ? (
    <>
      <HelperTextItem variant="warning">
        {targetSkill != null && !isTargetSkillIncluded
          ? t("agentic.agent.testAddedSkillsUnavailableSkill", {
              skill: targetSkill.name,
            })
          : t("agentic.agent.testAddedSkillsUnavailable")}
      </HelperTextItem>
      {targetSkillIncludedHelper}
    </>
  ) : isSkillsLoading ? (
    <HelperTextItem>{t("agentic.agent.testAddedSkillsLoading")}</HelperTextItem>
  ) : hasNoSkills ? (
    <HelperTextItem>{t("agentic.agent.testAddedSkillsNone")}</HelperTextItem>
  ) : (
    <>
      <HelperTextItem>{t("agentic.agent.testAddedSkillsHelp")}</HelperTextItem>
      {targetSkillIncludedHelper}
      {collectionsError != null &&
        (agent?.skillCollections ?? []).length > 0 && (
          <HelperTextItem variant="warning">
            {t("agentic.agent.testAddedSkillsCollectionsUnavailable")}
          </HelperTextItem>
        )}
    </>
  );

  return (
    <>
      <ModalHeader
        title={t("agentic.agent.test")}
        description={
          targetSkill != null && !isTargetSkillIncluded
            ? t("agentic.agent.testDescriptionSkill", {
                skill: targetSkill.name,
              })
            : t("agentic.agent.testDescription", { agent: agent?.name })
        }
      />
      <ModalBody>
        <Form id="agent-test-form" onSubmit={handleSubmit(submit)}>
          {isSkillMode && (
            <HookFormPFGroupController
              control={control}
              name="agentId"
              label={t("agentic.entity.agent")}
              fieldId="agent-test-agent-select-input"
              isRequired
              renderInput={({ field: { value, name, onChange } }) => (
                <>
                  <TypeaheadSelect
                    toggleId="agent-test-agent-select"
                    toggleAriaLabel={t("agentic.agent.testAgentSelect")}
                    ariaLabel={name}
                    inputAriaLabel={t("agentic.entity.agent")}
                    value={value}
                    options={agentOptions}
                    isDisabled={isLoadingAgents || agentsError != null}
                    maxMenuHeight={PICKER_MENU_HEIGHT}
                    popperProps={PICKER_MENU_POPPER}
                    inputAriaDescribedBy={
                      agentsError != null ? AGENT_HELPER_ID : undefined
                    }
                    onSelect={(selection) => onChange(selection ?? "")}
                    placeholderText={t("agentic.agent.testAgentPlaceholder")}
                  />
                  {agentsError != null && (
                    <FormHelperText id={AGENT_HELPER_ID}>
                      <HelperText>
                        <HelperTextItem variant="error">
                          {t("agentic.agent.testAgentsUnavailable")}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}
            />
          )}
          <HookFormPFGroupController
            control={control}
            name="applicationId"
            label={t("terms.application")}
            fieldId="agent-test-application-select-input"
            isRequired
            renderInput={({ field: { value, name, onChange } }) => (
              <TypeaheadSelect
                toggleId="agent-test-application-select"
                toggleAriaLabel={t("agentic.agent.testApplicationSelect")}
                ariaLabel={name}
                inputAriaLabel={t("terms.application")}
                value={value}
                options={applicationOptions}
                onSelect={(selection) => onChange(selection ?? "")}
                placeholderText={t("agentic.agent.testApplicationPlaceholder")}
              />
            )}
          />
          <HookFormPFTextArea
            control={control}
            name="task"
            label={t("agentic.agent.testTask")}
            fieldId="agent-test-task"
            helperText={t("agentic.agent.testTaskHelp")}
            rows={4}
            resizeOrientation="vertical"
            isRequired
          />
          <HookFormPFGroupController
            control={control}
            name="addedSkillIds"
            label={t("agentic.agent.testAddedSkills")}
            fieldId={`${ADDED_SKILLS_ID}-input`}
            renderInput={() => (
              <>
                <MultiSelect
                  toggleId={ADDED_SKILLS_ID}
                  toggleAriaLabel={t("agentic.agent.selectSkills")}
                  ariaLabel={t("agentic.agent.testAddedSkills")}
                  placeholderText={t("agentic.agent.selectSkills")}
                  options={skillOptions}
                  values={selectedSkillIds}
                  isDisabled={isAddedSkillsDisabled}
                  hasCheckbox
                  hasBadge
                  hasChips
                  maxMenuHeight={PICKER_MENU_HEIGHT}
                  popperProps={PICKER_MENU_POPPER}
                  inputAriaLabel={t("agentic.agent.testAddedSkills")}
                  inputAriaDescribedBy={ADDED_SKILLS_HELPER_ID}
                  onSelect={(selection) => {
                    if (
                      selection == null ||
                      isAddedSkillsDisabled ||
                      !isSelectable(selection)
                    ) {
                      return;
                    }
                    setValue(
                      "addedSkillIds",
                      addedSkillIds.includes(selection)
                        ? addedSkillIds.filter((id) => id !== selection)
                        : [...addedSkillIds, selection],
                      { shouldDirty: true, shouldValidate: true }
                    );
                  }}
                  onClear={() => {
                    if (isAddedSkillsDisabled) return;
                    setValue("addedSkillIds", [], {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
                {/* Own helper: it has a warning variant and a second line. */}
                <FormHelperText id={ADDED_SKILLS_HELPER_ID}>
                  <HelperText>{addedSkillsHelper}</HelperText>
                </FormHelperText>
              </>
            )}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form="agent-test-form"
          variant="primary"
          isDisabled={
            agent == null || !isValid || isSubmitting || startRun.isPending
          }
          isLoading={startRun.isPending}
        >
          {t("agentic.agent.startTest")}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
