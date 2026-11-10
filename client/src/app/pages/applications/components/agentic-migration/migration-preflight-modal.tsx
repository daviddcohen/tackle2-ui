import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { LocationDescriptor } from "history";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { object, string } from "yup";
import {
  Alert,
  Button,
  Content,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ApplicationMigrationMap,
  EntityId,
  StartApplicationMigrationsRequest,
} from "@app/agentic";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import {
  useFetchApplicationMigrations,
  useFetchMigrationPlans,
} from "@app/queries/agentic";

export const DEFAULT_TARGET_BRANCH = "mta/agentic-migration";

export interface MigrationPreflightValues {
  planSelection: "recommended" | "single";
  planId: EntityId;
  targetBranch: string;
}

interface MigrationPreflightModalProps {
  applications: Ref[];
  /**
   * Migration views the caller already holds. When omitted, the dialog fetches
   * the views of `applications` itself.
   */
  migrations?: ApplicationMigrationMap;
  /** Prefills the form, for example to start a new run like a failed one. */
  initialValues?: Partial<MigrationPreflightValues>;
  isStarting?: boolean;
  /** Builds a link that carries the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  onClose: () => void;
  onStartReady: (request: StartApplicationMigrationsRequest) => void;
}

/**
 * Preflight before starting migrations: shows each application's resolved
 * Plan and readiness and starts the ready ones. Mount it only while open, so
 * every opening starts from a fresh form.
 */
export const MigrationPreflightModal: React.FC<
  MigrationPreflightModalProps
> = ({
  applications,
  migrations: providedMigrations,
  initialValues,
  isStarting = false,
  linkTo: to,
  onClose,
  onStartReady,
}) => {
  const { t } = useTranslation();
  const {
    migrations: fetchedMigrations,
    isLoading: isLoadingMigrations,
    fetchError: migrationsFetchError,
  } = useFetchApplicationMigrations(
    providedMigrations ? [] : applications.map((application) => application.id)
  );
  const migrations = providedMigrations ?? fetchedMigrations;
  const { migrationPlans: plans } = useFetchMigrationPlans();
  const schema = object({
    planSelection: string().oneOf(["recommended", "single"]).required(),
    planId: string().when("planSelection", {
      is: "single",
      then: (field) =>
        field.required(t("agentic.execution.planOverrideRequired")),
    }),
    targetBranch: string()
      .trim()
      .required(t("agentic.execution.targetBranchRequired")),
  });
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid },
  } = useForm<MigrationPreflightValues>({
    defaultValues: {
      planSelection: "recommended",
      planId: "",
      targetBranch: DEFAULT_TARGET_BRANCH,
      ...initialValues,
    },
    mode: "onChange",
    resolver: yupResolver(schema),
  });

  const rows = applications
    .map((application) => ({
      application,
      migration: migrations[application.id],
    }))
    .filter((row) => row.migration != null);
  const readyApplications = rows
    .filter(({ migration }) => migration?.preflight === "ready")
    .map(({ application }) => application);
  const excludedCount = applications.length - readyApplications.length;
  const planSelection = useWatch({ control, name: "planSelection" });
  const planId = useWatch({ control, name: "planId" });
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const planOptions: FilterSelectOptionProps[] = plans.map((plan) => ({
    value: plan.id,
    label: plan.name,
  }));

  const submit = (values: MigrationPreflightValues) => {
    onStartReady({
      applicationIds: readyApplications.map((application) => application.id),
      planSelection: values.planSelection,
      planId: values.planSelection === "single" ? values.planId : undefined,
      targetBranch: values.targetBranch.trim(),
    });
  };

  return (
    <Modal isOpen onClose={onClose} variant="large">
      <ModalHeader
        title={t("agentic.execution.startMigration")}
        description={t("agentic.execution.preflightDescription", {
          count: applications.length,
        })}
      />
      <ModalBody>
        {migrationsFetchError != null && (
          <Alert
            isInline
            variant="danger"
            title={t("agentic.execution.unavailableTitle")}
          >
            {t("agentic.execution.unavailableDescription")}
          </Alert>
        )}
        {isLoadingMigrations ? (
          <AppPlaceholder />
        ) : (
          <Form id="migration-preflight-form" onSubmit={handleSubmit(submit)}>
            <Stack hasGutter>
              <StackItem>
                <FormGroup
                  role="radiogroup"
                  fieldId="plan-selection"
                  label={t("agentic.execution.planSelection")}
                >
                  <Radio
                    id="plan-selection-recommended"
                    name="plan-selection"
                    label={t("agentic.execution.recommendedPlan")}
                    description={t(
                      "agentic.execution.recommendedPlanDescription"
                    )}
                    isChecked={planSelection === "recommended"}
                    onChange={() =>
                      setValue("planSelection", "recommended", {
                        shouldValidate: true,
                      })
                    }
                  />
                  <Radio
                    id="plan-selection-single"
                    name="plan-selection"
                    label={t("agentic.execution.singlePlan")}
                    description={t("agentic.execution.singlePlanDescription")}
                    isChecked={planSelection === "single"}
                    onChange={() =>
                      setValue("planSelection", "single", {
                        shouldValidate: true,
                      })
                    }
                  />
                </FormGroup>
              </StackItem>
              {planSelection === "single" && (
                <StackItem>
                  <HookFormPFGroupController
                    control={control}
                    name="planId"
                    label={t("agentic.execution.planOverride")}
                    fieldId="plan-override"
                    isRequired
                    renderInput={({ field: { value, name, onChange } }) => (
                      <TypeaheadSelect
                        toggleId="plan-override-select"
                        toggleAriaLabel={t("agentic.execution.planOverride")}
                        ariaLabel={name}
                        value={value}
                        options={planOptions}
                        onSelect={(selection) => onChange(selection ?? "")}
                        placeholderText={t(
                          "agentic.execution.planOverridePlaceholder"
                        )}
                      />
                    )}
                  />
                  <Alert
                    isInline
                    variant="warning"
                    title={t("agentic.execution.expertOverrideTitle")}
                  >
                    {t("agentic.execution.expertOverrideDescription")}
                  </Alert>
                </StackItem>
              )}
              <StackItem>
                <HookFormPFTextInput
                  control={control}
                  name="targetBranch"
                  label={t("agentic.execution.targetBranch")}
                  fieldId="migration-target-branch"
                  helperText={t("agentic.execution.targetBranchDescription")}
                  isRequired
                />
              </StackItem>
              {excludedCount > 0 && (
                <StackItem>
                  <Alert
                    isInline
                    variant="warning"
                    title={t("agentic.execution.excludedTitle", {
                      count: excludedCount,
                    })}
                  >
                    {t("agentic.execution.excludedDescription")}
                  </Alert>
                </StackItem>
              )}
              <StackItem>
                <Table
                  aria-label={t("agentic.execution.preflightTable")}
                  variant="compact"
                >
                  <Thead>
                    <Tr>
                      <Th>{t("terms.application")}</Th>
                      <Th>{t("agentic.plan.targetProfile")}</Th>
                      <Th>{t("agentic.execution.resolvedPlan")}</Th>
                      <Th>{t("agentic.execution.readiness")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rows.map(
                      ({ application, migration }) =>
                        migration && (
                          <Tr key={application.id}>
                            <Td dataLabel={t("terms.application")}>
                              {application.name}
                            </Td>
                            <Td dataLabel={t("agentic.plan.targetProfile")}>
                              {migration.targetProfile?.name ||
                                t("agentic.plan.notConfigured")}
                            </Td>
                            <Td dataLabel={t("agentic.execution.resolvedPlan")}>
                              {planSelection === "single" && selectedPlan ? (
                                <Link
                                  to={to(
                                    DevPaths.migrationPlanDetails.replace(
                                      ":planId",
                                      selectedPlan.id.toString()
                                    )
                                  )}
                                >
                                  {selectedPlan.name}
                                </Link>
                              ) : migration.plan ? (
                                <Link
                                  to={to(
                                    DevPaths.migrationPlanDetails.replace(
                                      ":planId",
                                      migration.plan.id.toString()
                                    )
                                  )}
                                >
                                  {migration.plan.name}
                                </Link>
                              ) : (
                                t("agentic.plan.notConfigured")
                              )}
                            </Td>
                            <Td dataLabel={t("agentic.execution.readiness")}>
                              <Label
                                color={
                                  migration.preflight === "ready"
                                    ? "green"
                                    : migration.preflight === "blocked"
                                      ? "red"
                                      : "orange"
                                }
                                isCompact
                              >
                                {t(
                                  `agentic.execution.preflight.${migration.preflight || "blocked"}`
                                )}
                              </Label>
                              {migration.preflightReason && (
                                <Content component="small">
                                  {migration.preflightReason}
                                </Content>
                              )}
                            </Td>
                          </Tr>
                        )
                    )}
                  </Tbody>
                </Table>
              </StackItem>
            </Stack>
          </Form>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form="migration-preflight-form"
          variant="primary"
          isDisabled={readyApplications.length === 0 || !isValid || isStarting}
          isLoading={isStarting}
        >
          {t("agentic.execution.startReady", {
            count: readyApplications.length,
          })}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
