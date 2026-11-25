import * as React from "react";
import { AxiosError } from "axios";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertActionLink,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@patternfly/react-core";

import { DevPaths } from "@app/Paths";
import type { EntityId, MigrationPlan } from "@app/agentic";
import type { Archetype, TargetProfile } from "@app/api/models";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { useAssignPlanToTargetProfileMutation } from "@app/queries/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

const FORM_ID = "assign-migration-plan-form";
const TITLE_ID = "assign-migration-plan-modal-title";

export interface AssignMigrationPlanModalProps {
  archetype: Archetype;
  profile: TargetProfile;
  /** The plan assigned to the profile today, if any. */
  assignedPlan: MigrationPlan | undefined;
  /** Every migration plan: any plan can be assigned to any target profile. */
  plans: MigrationPlan[];
  isPlansError: boolean;
  linkTo: (pathname: string) => LocationDescriptor;
  onClose: () => void;
}

/**
 * Assign (or change) the migration plan of a target profile.
 * When nothing can be submitted, the field is replaced by an alert with the
 * next step and the footer is a single secondary Close.
 */
export const AssignMigrationPlanModal: React.FC<
  AssignMigrationPlanModalProps
> = ({
  archetype,
  profile,
  assignedPlan,
  plans,
  isPlansError,
  linkTo,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const PlansLink = useLinkComponent(linkTo(DevPaths.migrationPlans));
  const [planId, setPlanId] = React.useState<EntityId | null>(
    assignedPlan?.id ?? null
  );
  const { mutate: assignPlan, isPending } =
    useAssignPlanToTargetProfileMutation(
      () => {
        pushNotification({
          title: t("agentic.archetype.planAssigned"),
          variant: "success",
        });
        onClose();
      },
      (error: AxiosError) =>
        pushNotification({
          title: getAxiosErrorMessage(error),
          variant: "danger",
        })
    );

  const canSubmit = !isPlansError && plans.length > 0;
  const isUnchanged = planId == null || planId === assignedPlan?.id;
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isUnchanged || isPending || planId == null) return;
    assignPlan({
      archetypeId: archetype.id,
      targetProfileId: profile.id,
      planId,
    });
  };

  let body: React.ReactNode;
  if (isPlansError) {
    body = (
      <Alert
        variant="danger"
        isInline
        title={t("agentic.archetype.plansLoadFailed")}
      />
    );
  } else if (plans.length === 0) {
    body = (
      <Alert
        variant="info"
        isInline
        title={t("agentic.archetype.noPlansTitle")}
        actionLinks={
          <AlertActionLink component={PlansLink}>
            {t("agentic.archetype.goToPlans")}
          </AlertActionLink>
        }
      >
        {t("agentic.archetype.noPlansBody", { profile: profile.name })}
      </Alert>
    );
  } else {
    body = (
      <Form id={FORM_ID} onSubmit={onSubmit}>
        <FormGroup
          label={t("agentic.entity.migrationPlan")}
          fieldId="migration-plan-select"
          isRequired
        >
          <FormSelect
            id="migration-plan-select"
            value={planId ?? ""}
            onChange={(_event, value) => setPlanId(value || null)}
          >
            <FormSelectOption
              value=""
              label={t("agentic.archetype.selectPlan")}
              isDisabled
            />
            {plans.map((plan) => (
              <FormSelectOption
                key={plan.id}
                value={plan.id}
                label={plan.name}
              />
            ))}
          </FormSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t("agentic.archetype.assignPlanHelper")}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Form>
    );
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby={TITLE_ID}
      id="assign-migration-plan-modal"
    >
      <ModalHeader
        labelId={TITLE_ID}
        title={
          assignedPlan
            ? t("agentic.archetype.changePlan")
            : t("agentic.archetype.assignPlan")
        }
        description={t("agentic.archetype.assignPlanDescription", {
          archetype: archetype.name,
          profile: profile.name,
        })}
      />
      <ModalBody>{body}</ModalBody>
      <ModalFooter>
        {canSubmit ? (
          <>
            <Button
              variant="primary"
              type="submit"
              form={FORM_ID}
              isDisabled={isUnchanged || isPending}
              isLoading={isPending}
            >
              {t("actions.save")}
            </Button>
            <Button variant="link" onClick={onClose}>
              {t("actions.cancel")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t("actions.close")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
