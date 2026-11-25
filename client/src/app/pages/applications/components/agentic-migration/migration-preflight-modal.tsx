import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { LocationDescriptor } from "history";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { object, string } from "yup";
import {
  Alert,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";
import {
  Caption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";

import { DevPaths } from "@app/Paths";
import {
  ApplicationMigrationMap,
  ApplicationMigrationView,
  EntityId,
  EntityRef,
  StartApplicationMigrationsRequest,
  UNCONFIGURED_MIGRATION,
} from "@app/agentic";
import { Ref } from "@app/api/models";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { EmptyTextMessage } from "@app/components/EmptyTextMessage";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  MigrationStatus,
  preflightDisplayStatus,
} from "@app/pages/agentic/components/agentic-status";
import {
  useFetchApplicationMigrations,
  useFetchMigrationPlans,
} from "@app/queries/agentic";
import { universalComparator } from "@app/utils/utils";

import { applicationDetailsPath, planRunPath } from "./paths";
import { runExclusionsToSend } from "./run-exclusions";
import { RunSkillsPreview, useRunGroupSkills } from "./run-skills-preview";
import {
  PlanChoice,
  PreflightRow,
  TargetProfileChoice,
  TargetProfilePicks,
  groupReadyApplicationsByPlan,
  startApplicationIds,
  startTargetProfiles,
  targetProfileChoice,
} from "./start-groups";
import { TargetProfileSelect } from "./target-profile-select";

export const DEFAULT_TARGET_BRANCH = "konveyor/agentic-migration";

export interface MigrationPreflightValues {
  planSelection: "recommended" | "single";
  planId: EntityId;
  targetBranch: string;
}

/** The migration plan a dialog opened from that plan runs. */
export interface PreflightFixedPlan {
  id: EntityId;
  name: string;
  /** Shown in the description when the plan has one. */
  targetProfile?: string;
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
  /**
   * The plan of the failed run this dialog runs again. Picking that plan for
   * all applications is not an override, so its caution is hidden; any
   * other plan still shows it.
   */
  rerunPlanId?: EntityId;
  /**
   * Skills excluded on their own when the dialog opens, by plan id: a
   * rerun starts with the failed run's (`PlanRun.excludedSkills`).
   */
  initialExcludedSkills?: Readonly<Record<EntityId, readonly EntityId[]>>;
  /**
   * Opened from a migration plan: every application runs this plan. The plan
   * choice and the per-row target profile and plan columns are hidden, and
   * the user picks which ready applications run (they start selected).
   */
  plan?: PreflightFixedPlan;
  isStarting?: boolean;
  /** Builds a link that carries the caller's breadcrumb trail. */
  linkTo: (pathname: string, search?: string) => LocationDescriptor;
  onClose: () => void;
  onStartReady: (request: StartApplicationMigrationsRequest) => void;
}

/**
 * Why an application cannot start, as the server says it. A run the reason
 * names becomes a link by splitting at the view's run name; never by
 * guessing from the text.
 */
const PreflightReason: React.FC<{
  migration: ApplicationMigrationView;
  linkTo: MigrationPreflightModalProps["linkTo"];
}> = ({ migration: { preflightReason: reason, planRun }, linkTo }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // No link to the page the dialog was opened from: it would change nothing.
  const runTo =
    planRun != null && planRunPath(planRun.id) !== pathname
      ? linkTo(planRunPath(planRun.id))
      : undefined;
  const RunLink = useLinkComponent(runTo);
  if (!reason) return null;
  let content: React.ReactNode = reason;
  if (planRun != null && runTo != null) {
    const at = reason.indexOf(planRun.name);
    content =
      at >= 0 ? (
        <>
          {reason.slice(0, at)}
          <Link to={runTo}>{planRun.name}</Link>
          {reason.slice(at + planRun.name.length)}
        </>
      ) : (
        <>
          {reason}{" "}
          <Button variant="link" isInline component={RunLink}>
            {t("agentic.execution.viewPlanRun")}
          </Button>
        </>
      );
  }
  return (
    <HelperText>
      <HelperTextItem>{content}</HelperTextItem>
    </HelperText>
  );
};

/**
 * "Run migration plan": the
 * readiness of each selected application first, then how to run the ready
 * ones. Mount it only while open, so every opening starts from a fresh form.
 */
export const MigrationPreflightModal: React.FC<
  MigrationPreflightModalProps
> = ({
  applications,
  migrations: providedMigrations,
  initialValues,
  rerunPlanId,
  initialExcludedSkills,
  plan: fixedPlan,
  isStarting = false,
  linkTo: to,
  onClose,
  onStartReady,
}) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Here, not in the preview, so it survives the preview hiding and showing.
  const [isSkillsExpanded, setSkillsExpanded] = React.useState(false);
  // The target profile picked per application, and the skills each plan run
  // excludes on its own (by plan id): kept while the dialog is open, so
  // switching the plan choice back restores them.
  const [targetProfilePicks, setTargetProfilePicks] =
    React.useState<TargetProfilePicks>({});
  const [runExclusions, setRunExclusions] = React.useState<
    Readonly<Record<EntityId, readonly EntityId[]>>
  >(initialExcludedSkills ?? {});
  const setIncluded = (
    runPlanId: EntityId,
    skill: EntityRef,
    included: boolean
  ) =>
    setRunExclusions((current) => {
      const others = (current[runPlanId] ?? []).filter((id) => id !== skill.id);
      return {
        ...current,
        [runPlanId]: included ? others : [...others, skill.id],
      };
    });
  const {
    migrations: fetchedMigrations,
    isLoading: isLoadingMigrations,
    fetchError: migrationsFetchError,
  } = useFetchApplicationMigrations(
    providedMigrations ? [] : applications.map((application) => application.id)
  );
  const migrations = providedMigrations ?? fetchedMigrations;
  const { migrationPlans: plans, isLoading: isLoadingPlans } =
    useFetchMigrationPlans();
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
      ...(fixedPlan != null
        ? { planSelection: "single" as const, planId: fixedPlan.id }
        : {}),
    },
    mode: "onChange",
    resolver: yupResolver(schema),
  });

  // By name, like the inventory. A backend may omit an application no plan
  // resolves for.
  const rows = [...applications]
    .sort((a, b) => universalComparator(a.name, b.name))
    .map((application) => ({
      application,
      migration: migrations[application.id] ?? UNCONFIGURED_MIGRATION,
    }));
  const readyApplications = rows
    .filter(({ migration }) => migration.preflight === "ready")
    .map(({ application }) => application);
  const readyCount = readyApplications.length;
  const total = applications.length;
  const isLoaded = !isLoadingMigrations && migrationsFetchError == null;
  const isNoneReady = isLoaded && readyCount === 0;
  // Fixed plan only: the ready applications the user picked, all of them
  // until the first change (readiness can arrive after the dialog opens).
  const isFixedPlan = fixedPlan != null;
  // Nothing to pick when no row is ready: the alert and the reasons say why.
  const isSelectable = isFixedPlan && readyCount > 0;
  const [pickedIds, setPickedIds] = React.useState<Set<number>>();
  const runApplications =
    isFixedPlan && pickedIds != null
      ? readyApplications.filter((application) => pickedIds.has(application.id))
      : readyApplications;
  const runIds = new Set(runApplications.map((application) => application.id));
  const runCount = runApplications.length;
  const setPicked = (id: number, isSelecting: boolean) => {
    const next = new Set(runIds);
    if (isSelecting) next.add(id);
    else next.delete(id);
    setPickedIds(next);
  };
  const planSelection = useWatch({ control, name: "planSelection" });
  const planId = useWatch({ control, name: "planId" });
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const planOptions: FilterSelectOptionProps[] = plans.map((plan) => ({
    value: plan.id,
    label: plan.name,
  }));
  const planLink = (plan: { id: EntityId; name: string }) => (
    <Link
      to={to(DevPaths.migrationPlanDetails.replace(":planId", String(plan.id)))}
    >
      {plan.name}
    </Link>
  );

  // The plan runs Run starts: the skills preview and submit both read
  // these, so the preview shows exactly what Run sends. From a fixed plan
  // only the selected ready rows start (otherwise runIds is every ready row).
  const startRows = rows.filter(({ application }) =>
    runIds.has(application.id)
  );
  const groupStarts = (choice: PlanChoice) =>
    groupReadyApplicationsByPlan(
      startRows,
      choice,
      plans,
      targetProfilePicks
    ).map((group) =>
      // The fixed plan keeps its name while the plans list loads.
      fixedPlan != null && group.plan.id === fixedPlan.id
        ? { ...group, plan: { id: fixedPlan.id, name: fixedPlan.name } }
        : group
    );
  const startGroups = groupStarts({ planSelection, planId });
  const isPlanMissing = planSelection === "single" && planId === "";
  // The target profile each ready row runs on, for the plan choice; none
  // before a plan is picked for all, and none for a row that cannot start.
  const choiceOf = ({
    application,
    migration,
  }: PreflightRow): TargetProfileChoice | undefined =>
    migration.preflight === "ready" && !isPlanMissing
      ? targetProfileChoice(
          migration,
          { planSelection, planId },
          selectedPlan,
          targetProfilePicks[application.id]
        )
      : undefined;
  const hasChoice = (choice: TargetProfileChoice | undefined) =>
    (choice?.kind === "picked" || choice?.kind === "required") &&
    choice.candidates.length > 1;
  // Ready rows that still need a target profile (picked, or the plan's
  // path to load): Run waits for them. With each application's plan they
  // are in no plan run yet, so the Run label counts them on top.
  const awaitingProfile = startRows.filter((row) => {
    const kind = choiceOf(row)?.kind;
    return kind === "required" || kind === "loading";
  });
  const isTargetProfileMissing = awaitingProfile.length > 0;
  // Resolved while the preview is open, and whenever a plan run excludes
  // skills (a rerun's), so Run sends only exclusions that still resolve.
  const excludedOf = (id: EntityId) => runExclusions[id] ?? [];
  const groupSkills = useRunGroupSkills(
    startGroups,
    migrations,
    isLoadingPlans,
    isSkillsExpanded ||
      startGroups.some((group) => excludedOf(group.plan.id).length > 0)
  );
  const exclusionsToSend = (id: EntityId) => {
    const index = startGroups.findIndex((group) => group.plan.id === id);
    return runExclusionsToSend(groupSkills[index]?.skills, excludedOf(id));
  };
  // The failed run's own exclusions that Run still sends (they still
  // resolve, the plan does not exclude them already, and the user kept them).
  const hasRerunExclusions = startGroups.some((group) =>
    exclusionsToSend(group.plan.id).some((id) =>
      initialExcludedSkills?.[group.plan.id]?.includes(id)
    )
  );
  const excludedCount = startGroups.reduce(
    (count, group) => count + exclusionsToSend(group.plan.id).length,
    0
  );
  // What Run sends. Before a plan is picked for all, nothing can be sent
  // (Run is disabled): the label still names the ready applications (the
  // selected ones from a fixed plan).
  const startCount = isPlanMissing
    ? runCount
    : startApplicationIds(startGroups).length +
      (planSelection === "recommended" ? awaitingProfile.length : 0);

  const submit = (values: MigrationPreflightValues) => {
    const groups = groupStarts(values);
    const excludedSkills = groups
      .map((group) => ({
        plan: { id: group.plan.id },
        skills: exclusionsToSend(group.plan.id).map((id) => ({ id })),
      }))
      .filter((entry) => entry.skills.length > 0);
    const targetProfiles = startTargetProfiles(groups);
    onStartReady({
      applicationIds: startApplicationIds(groups),
      planSelection: values.planSelection,
      planId: values.planSelection === "single" ? values.planId : undefined,
      targetBranch: values.targetBranch.trim(),
      ...(targetProfiles != null ? { targetProfiles } : {}),
      ...(excludedSkills.length > 0 ? { excludedSkills } : {}),
    });
  };

  // Nothing to preview when nothing can start: no ready application, or
  // none selected from a fixed plan.
  const skillsPreview =
    isNoneReady || (isFixedPlan && runCount === 0) ? null : (
      <RunSkillsPreview
        groups={startGroups}
        skills={groupSkills}
        excludedSkills={runExclusions}
        excludedCount={excludedCount}
        onIncludeChange={setIncluded}
        isPlanMissing={isPlanMissing}
        isTargetProfileMissing={isTargetProfileMissing}
        isRerun={rerunPlanId != null}
        hasRerunExclusions={hasRerunExclusions}
        isExpanded={isSkillsExpanded}
        onExpandedChange={setSkillsExpanded}
      />
    );

  // From a plan, the column appears only when some application has a
  // choice: the description names the plan's target profile otherwise.
  const showsTargetProfile =
    !isFixedPlan || rows.some((row) => hasChoice(choiceOf(row)));
  const none = <EmptyTextMessage message={t("agentic.execution.none")} />;

  const targetProfileCell = (
    { application, migration }: PreflightRow,
    choice: TargetProfileChoice | undefined
  ): React.ReactNode => {
    if (isPlanMissing) {
      return <EmptyTextMessage message={t("agentic.execution.notSelected")} />;
    }
    if (choice == null) return migration.targetProfile?.name ?? none;
    switch (choice.kind) {
      case "server":
        return choice.path?.targetProfile.name ?? none;
      case "loading":
        return (
          <Skeleton
            width="8rem"
            screenreaderText={t("agentic.runSkills.loadingTargetProfile")}
          />
        );
      default:
        if (hasChoice(choice)) {
          return (
            <TargetProfileSelect
              application={application}
              candidates={choice.candidates}
              selectedId={
                choice.kind === "picked"
                  ? choice.path?.targetProfile.id
                  : undefined
              }
              showsPlans={planSelection === "recommended"}
              onSelect={(targetProfileId) =>
                setTargetProfilePicks((current) => ({
                  ...current,
                  [application.id]: targetProfileId,
                }))
              }
            />
          );
        }
        if (choice.kind === "picked" && choice.path != null) {
          return choice.path.targetProfile.name;
        }
        // One plan for all, without a target profile on this application's
        // archetypes: the run gets none, so no target profile skills.
        return planSelection === "single" ? (
          <>
            {none}
            <HelperText>
              <HelperTextItem>
                {t("agentic.runSkills.noPlanProfile")}
              </HelperTextItem>
            </HelperText>
          </>
        ) : (
          none
        );
    }
  };

  const planCell = (
    migration: ApplicationMigrationView,
    choice: TargetProfileChoice | undefined
  ): React.ReactNode => {
    if (planSelection === "single") {
      return selectedPlan ? (
        planLink(selectedPlan)
      ) : (
        // An override without a pick is not the recommended plan.
        <EmptyTextMessage message={t("agentic.execution.notSelected")} />
      );
    }
    if (choice?.kind === "required") {
      return <EmptyTextMessage message={t("agentic.execution.notSelected")} />;
    }
    // The plan of the picked target profile, else the server's.
    const plan = choice?.kind === "picked" ? choice.path?.plan : migration.plan;
    return plan != null ? (
      planLink(plan)
    ) : (
      <EmptyTextMessage message={t("agentic.execution.notAssigned")} />
    );
  };

  const readinessTable = (
    <Table
      aria-label={
        fixedPlan != null
          ? t("agentic.plan.applicationsOfPlan", { plan: fixedPlan.name })
          : t("agentic.execution.preflightTable")
      }
      variant="compact"
    >
      {!(isFixedPlan && readyCount === 0) && (
        <Caption>
          {isSelectable ? (
            t("agentic.execution.selectedCaption", {
              selected: runCount,
              count: readyCount,
            })
          ) : (
            <>
              {t("agentic.execution.readyCaption", {
                ready: readyCount,
                count: total,
              })}
              {readyCount > 0 && readyCount < total
                ? ` ${t("agentic.execution.readyOnly")}`
                : null}
            </>
          )}
        </Caption>
      )}
      <Thead>
        <Tr>
          {isSelectable && (
            <Th
              select={{
                // From the partial state a click selects every ready row,
                // like the inventory's bulk selector.
                onSelect: (_event, isSelecting) =>
                  setPickedIds(
                    new Set(
                      isSelecting || runCount < readyCount
                        ? readyApplications.map((application) => application.id)
                        : []
                    )
                  ),
                isSelected: runCount === readyCount,
                isIndeterminate: runCount > 0 && runCount < readyCount,
              }}
            />
          )}
          <Th>{t("terms.application")}</Th>
          {showsTargetProfile && (
            <Th>{t("agentic.execution.targetProfile")}</Th>
          )}
          {!isFixedPlan && (
            <Th modifier="wrap">{t("agentic.execution.planColumn")}</Th>
          )}
          <Th>{t("agentic.execution.readiness")}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, rowIndex) => {
          const { application, migration } = row;
          // Only a row that starts offers a choice: from a plan, an
          // unselected row shows its default, like a row that is not ready.
          const choice = runIds.has(application.id) ? choiceOf(row) : undefined;
          return (
            <Tr key={application.id}>
              {isSelectable && (
                <Td
                  select={{
                    rowIndex,
                    onSelect: (_event, isSelecting) =>
                      setPicked(application.id, isSelecting),
                    isSelected: runIds.has(application.id),
                    isDisabled: migration.preflight !== "ready",
                  }}
                />
              )}
              <Td
                dataLabel={t("terms.application")}
                modifier="nowrap"
                // A row header names the row's checkbox for table navigation.
                {...(isFixedPlan && { component: "th", scope: "row" })}
              >
                {applicationDetailsPath(application.id) === pathname ? (
                  // Opened from this application's page: a link would change
                  // nothing and leave the dialog open.
                  application.name
                ) : (
                  <Link to={to(applicationDetailsPath(application.id))}>
                    {application.name}
                  </Link>
                )}
              </Td>
              {showsTargetProfile && (
                <Td dataLabel={t("agentic.execution.targetProfile")}>
                  {targetProfileCell(row, choice)}
                </Td>
              )}
              {!isFixedPlan && (
                <Td dataLabel={t("agentic.execution.planColumn")}>
                  {planCell(migration, choice)}
                </Td>
              )}
              <Td dataLabel={t("agentic.execution.readiness")}>
                <div>
                  <MigrationStatus
                    status={
                      preflightDisplayStatus[migration.preflight ?? "blocked"]
                    }
                  />
                  <PreflightReason migration={migration} linkTo={to} />
                </div>
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );

  const runOptions = (
    <Form id="migration-preflight-form" onSubmit={handleSubmit(submit)}>
      {!isFixedPlan && (
        <FormGroup
          role="radiogroup"
          isStack
          fieldId="plan-selection"
          label={t("agentic.execution.planSelection")}
        >
          <Radio
            id="plan-selection-recommended"
            name="plan-selection"
            label={t("agentic.execution.recommendedPlan")}
            description={t("agentic.execution.recommendedPlanDescription")}
            isChecked={planSelection === "recommended"}
            onChange={() =>
              setValue("planSelection", "recommended", { shouldValidate: true })
            }
          />
          <Radio
            id="plan-selection-single"
            name="plan-selection"
            label={t("agentic.execution.singlePlan")}
            description={t("agentic.execution.singlePlanDescription")}
            isChecked={planSelection === "single"}
            onChange={() =>
              setValue("planSelection", "single", { shouldValidate: true })
            }
          />
        </FormGroup>
      )}
      {!isFixedPlan && planSelection === "single" && (
        <HookFormPFGroupController
          control={control}
          name="planId"
          label={t("agentic.execution.planOverride")}
          fieldId="plan-override"
          isRequired
          renderInput={({
            field: { value, name, onChange },
            fieldState: { error, isDirty, isTouched },
          }) => (
            <>
              <TypeaheadSelect
                toggleId="plan-override-select"
                toggleAriaLabel={t("agentic.execution.planOverride")}
                ariaLabel={name}
                inputAriaLabel={t("agentic.execution.planOverride")}
                value={value}
                options={planOptions}
                onSelect={(selection) => onChange(selection ?? "")}
                placeholderText={t("agentic.execution.planOverridePlaceholder")}
              />
              {/* A plan picked for all applications is an override: say what
                  it does, unless the field shows its error instead. */}
              {!(rerunPlanId != null && value === rerunPlanId) &&
                !(error && (isDirty || isTouched)) && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="warning">
                        {t("agentic.execution.overrideCaution")}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
            </>
          )}
        />
      )}
      <HookFormPFTextInput
        control={control}
        name="targetBranch"
        label={t("agentic.execution.targetBranch")}
        fieldId="migration-target-branch"
        helperText={t("agentic.execution.targetBranchDescription")}
        isRequired
      />
    </Form>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="large"
      aria-labelledby="run-migration-plan-title"
    >
      <ModalHeader
        labelId="run-migration-plan-title"
        title={t("agentic.execution.startMigration")}
        description={
          fixedPlan == null
            ? t("agentic.execution.preflightDescription", {
                count: total,
                name: applications[0]?.name,
              })
            : fixedPlan.targetProfile != null
              ? t("agentic.execution.preflightDescriptionPlanProfile", {
                  plan: fixedPlan.name,
                  profile: fixedPlan.targetProfile,
                })
              : t("agentic.execution.preflightDescriptionPlan", {
                  plan: fixedPlan.name,
                })
        }
      />
      <ModalBody>
        {migrationsFetchError != null ? (
          <Alert
            isInline
            variant="danger"
            title={t("agentic.execution.unavailableTitle")}
          >
            {t("agentic.execution.unavailableDescription")}
          </Alert>
        ) : isLoadingMigrations ? (
          <AppPlaceholder />
        ) : (
          <Stack hasGutter>
            {isNoneReady && (
              <StackItem>
                <Alert
                  isInline
                  variant="danger"
                  title={
                    isFixedPlan
                      ? t("agentic.execution.noneReadyPlanTitle")
                      : t("agentic.execution.noneReadyTitle")
                  }
                >
                  {isFixedPlan
                    ? t("agentic.execution.noneReadyPlanDescription")
                    : t("agentic.execution.noneReadyDescription")}
                </Alert>
              </StackItem>
            )}
            <StackItem>{readinessTable}</StackItem>
            {!isNoneReady && (
              <StackItem className={spacing.mtMd}>{runOptions}</StackItem>
            )}
            {/* After the options, so hiding it moves nothing above the pointer. */}
            {skillsPreview != null && <StackItem>{skillsPreview}</StackItem>}
          </Stack>
        )}
      </ModalBody>
      <ModalFooter>
        {isLoaded && !isNoneReady ? (
          <>
            <Button
              type="submit"
              form="migration-preflight-form"
              variant="primary"
              isDisabled={
                !isValid ||
                isStarting ||
                startCount === 0 ||
                isTargetProfileMissing
              }
              isLoading={isStarting}
            >
              {t("agentic.execution.startReady", { count: startCount })}
            </Button>
            <Button variant="link" onClick={onClose}>
              {t("actions.cancel")}
            </Button>
          </>
        ) : isLoadingMigrations ? (
          <Button variant="link" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
        ) : (
          // Nothing to submit: one secondary Close.
          <Button variant="secondary" onClick={onClose}>
            {t("actions.close")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
