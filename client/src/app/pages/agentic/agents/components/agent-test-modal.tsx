import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { object, string } from "yup";
import {
  Alert,
  Button,
  Form,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@patternfly/react-core";

import { Agent } from "@app/agentic";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useStartAgentTestRunMutation } from "@app/queries/agentic";
import { useFetchApplications } from "@app/queries/applications";
import { getAxiosErrorMessage } from "@app/utils/utils";

interface AgentTestModalProps {
  agent: Agent | null;
  onClose: () => void;
}

interface FormValues {
  applicationId: string;
  task: string;
}

/**
 * The form lives in a child keyed by the Agent, so each opening (and each
 * Agent) starts from an empty form instead of the previous Agent's input.
 */
export const AgentTestModal: React.FC<AgentTestModalProps> = ({
  agent,
  onClose,
}) => (
  <Modal isOpen={agent != null} onClose={onClose} variant="medium">
    {agent != null && (
      <AgentTestModalContent key={agent.id} agent={agent} onClose={onClose} />
    )}
  </Modal>
);

const AgentTestModalContent: React.FC<{
  agent: Agent;
  onClose: () => void;
}> = ({ agent, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { data: applications = [] } = useFetchApplications();
  const applicationOptions: FilterSelectOptionProps[] = applications.map(
    (application) => ({
      value: application.id.toString(),
      label: application.name,
    })
  );
  const schema = object({
    applicationId: string().required(
      t("agentic.agent.testApplicationRequired")
    ),
    task: string().trim().required(t("agentic.agent.testTaskRequired")),
  });
  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { applicationId: "", task: "" },
    mode: "onChange",
    resolver: yupResolver(schema),
  });
  const startRun = useStartAgentTestRunMutation(
    () => {
      pushNotification({
        title: t("agentic.agent.testQueued", { agent: agent.name }),
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
    startRun.mutate({
      agentId: agent.id,
      applicationId: Number(values.applicationId),
      task: values.task.trim(),
    });
  };

  return (
    <>
      <ModalHeader
        title={t("agentic.agent.testTitle", { agent: agent.name })}
        description={t("agentic.agent.testDescription")}
      />
      <ModalBody>
        <Form id="agent-test-form" onSubmit={handleSubmit(submit)}>
          <Alert
            isInline
            variant="info"
            title={t("agentic.agent.testRunNotice")}
          />
          <HookFormPFGroupController
            control={control}
            name="applicationId"
            label={t("terms.application")}
            fieldId="agent-test-application"
            isRequired
            renderInput={({ field: { value, name, onChange } }) => (
              <TypeaheadSelect
                toggleId="agent-test-application-select"
                toggleAriaLabel={t("agentic.agent.testApplicationSelect")}
                ariaLabel={name}
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
            isRequired
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form="agent-test-form"
          variant="primary"
          isDisabled={!isValid || isSubmitting || startRun.isPending}
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
