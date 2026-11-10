import * as React from "react";
import { isAxiosError } from "axios";
import { Trans, useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  Alert,
  AlertVariant,
  ButtonVariant,
  Divider,
  DividerVariant,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalHeader,
  PageSection,
  Tab,
  TabContent,
  TabTitleText,
  Tabs,
} from "@patternfly/react-core";

import { DEFAULT_REFETCH_INTERVAL, isAgenticEnabled } from "@app/Constants";
import { ApplicationDetailsRoute, DevPaths } from "@app/Paths";
import { useHasSomeScopes } from "@app/auth";
import { AppPlaceholder } from "@app/components/AppPlaceholder";
import { ApplicationDependenciesForm } from "@app/components/ApplicationDependenciesFormContainer/ApplicationDependenciesForm";
import { BreadCrumbPath } from "@app/components/BreadCrumbPath";
import { ConditionalRender } from "@app/components/ConditionalRender";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { PageHeader } from "@app/components/PageHeader";
import { DrawerTabContent, ReviewFields } from "@app/components/detail-drawer";
import { tabPanelId, useUrlTab } from "@app/hooks/useUrlTab";
import { useEntityBreadcrumbs } from "@app/pages/agentic/useEntityBreadcrumbs";
import {
  useBulkDeleteApplicationMutation,
  useFetchApplicationById,
} from "@app/queries/applications";
import { useDeleteAssessmentMutation } from "@app/queries/assessments";
import { useDeleteReviewMutation } from "@app/queries/reviews";
import {
  TaskStates,
  useCancelTaskMutation,
  useFetchTaskDashboard,
} from "@app/queries/tasks";
import {
  analysesReadScopes,
  applicationsWriteScopes,
  assessmentWriteScopes,
  credentialsReadScopes,
  dependenciesWriteScopes,
  reviewsWriteScopes,
  tasksReadScopes,
  tasksWriteScopes,
} from "@app/scopes";
import { filterAndAddSeparator } from "@app/utils/grouping";
import { formatPath, getAxiosErrorMessage } from "@app/utils/utils";

import { TabDetailsContent } from "../application-detail-drawer/tab-details-content";
import { TabPlatformContent } from "../application-detail-drawer/tab-platform-content";
import { TabReportsContent } from "../application-detail-drawer/tab-reports-contents";
import { TabTagsContent } from "../application-detail-drawer/tab-tags-content";
import { TabTasksContent } from "../application-detail-drawer/tab-tasks-content";
import { ApplicationFormModal } from "../application-form";
import { ApplicationIdentityModal } from "../application-identity-form/application-identity-modal";
import { MIGRATION_TAB } from "../components/agentic-migration/paths";
import { GenerateAssetsWizard } from "../generate-assets-wizard";
import { RetrieveConfigWizard } from "../retrieve-config-wizard";
import {
  DecoratedApplication,
  useDecoratedApplications,
} from "../useDecoratedApplications";

import { MigrationTab } from "./components/migration-tab";
import { PlanRunsTab } from "./components/plan-runs-tab";
import { SkillsTab } from "./components/skills-tab";

const UPSTREAM_TABS = [
  "details",
  "tags",
  "reports",
  "review",
  "tasks",
  "platform",
] as const;
const AGENTIC_TABS = [MIGRATION_TAB, "plan-runs", "skills"] as const;

type AppDetailTab =
  | (typeof UPSTREAM_TABS)[number]
  | (typeof AGENTIC_TABS)[number];

/** Agentic tabs exist only where the agentic API is available. */
const APP_DETAIL_TABS: readonly AppDetailTab[] = isAgenticEnabled
  ? [...UPSTREAM_TABS, ...AGENTIC_TABS]
  : UPSTREAM_TABS;

const tabTitleKeys: Record<AppDetailTab, string> = {
  details: "agentic.applicationDetail.tabDetails",
  tags: "agentic.applicationDetail.tabTags",
  reports: "agentic.applicationDetail.tabReports",
  review: "agentic.applicationDetail.tabReview",
  tasks: "agentic.applicationDetail.tabTasks",
  platform: "agentic.applicationDetail.tabPlatform",
  migration: "agentic.execution.detailsTab",
  "plan-runs": "agentic.applicationDetail.tabPlanRuns",
  skills: "agentic.applicationDetail.tabSkills",
};

const panelId = (tab: AppDetailTab) => tabPanelId("application-detail", tab);

const ApplicationDetail: React.FC = () => {
  const { t } = useTranslation();
  const history = useHistory();
  const { applicationId: applicationIdParam } =
    useParams<ApplicationDetailsRoute>();
  // The route only matches digits.
  const applicationId = Number(applicationIdParam);
  const { pushNotification } = React.useContext(NotificationsContext);

  const [activeTab, setActiveTab] = useUrlTab(APP_DETAIL_TABS, "details");

  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDependenciesModalOpen, setIsDependenciesModalOpen] =
    React.useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] =
    React.useState(false);
  const [isRetrieveConfigOpen, setIsRetrieveConfigOpen] = React.useState(false);
  const [isGenerateAssetsOpen, setIsGenerateAssetsOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isCancelOpen, setIsCancelOpen] = React.useState(false);
  const [isDiscardAssessmentOpen, setIsDiscardAssessmentOpen] =
    React.useState(false);
  const [isDiscardReviewOpen, setIsDiscardReviewOpen] = React.useState(false);

  // Stop polling once the application cannot be read: a refetch of a query
  // that never had data puts it back into the loading state, which would make
  // the page flip between "Loading" and "not found".
  const [isPollingStopped, setIsPollingStopped] = React.useState(false);
  const {
    application: baseApplication,
    isFetching: isFetchingApplications,
    fetchError: applicationsFetchError,
  } = useFetchApplicationById(
    applicationId,
    isPollingStopped ? false : DEFAULT_REFETCH_INTERVAL
  );
  if (applicationsFetchError != null && !baseApplication && !isPollingStopped) {
    setIsPollingStopped(true);
  }
  const isNotFound =
    isAxiosError(applicationsFetchError) &&
    applicationsFetchError.response?.status === 404;
  const { tasks } = useFetchTaskDashboard();
  const baseApplications = React.useMemo(
    () => (baseApplication ? [baseApplication] : []),
    [baseApplication]
  );
  const { applications } = useDecoratedApplications(baseApplications, tasks);
  const application = applications.find((a) => a.id === applicationId);
  const { breadcrumbs, linkCrumbs } = useEntityBreadcrumbs(
    application?.name ??
      (applicationsFetchError != null && !isNotFound
        ? applicationIdParam
        : t("agentic.applicationDetail.notFound")),
    [{ title: t("sidebar.applicationInventory"), path: DevPaths.applications }]
  );

  const applicationWriteAccess = useHasSomeScopes(applicationsWriteScopes);
  const assessmentWriteAccess = useHasSomeScopes(assessmentWriteScopes);
  const reviewsWriteAccess = useHasSomeScopes(reviewsWriteScopes);
  const dependenciesWriteAccess = useHasSomeScopes(dependenciesWriteScopes);
  const credentialsReadAccess = useHasSomeScopes(credentialsReadScopes);
  const analysesReadAccess = useHasSomeScopes(analysesReadScopes);
  const tasksReadAccess = useHasSomeScopes(tasksReadScopes);
  const tasksWriteAccess = useHasSomeScopes(tasksWriteScopes);

  const isTaskCancellable = (app: DecoratedApplication) => {
    const task = app.tasks.currentAnalyzer;
    return !!task && !TaskStates.Terminal.includes(task?.state ?? "");
  };

  const { mutate: deleteAssessment } = useDeleteAssessmentMutation(
    (name) => {
      pushNotification({
        title: t("toastr.success.assessmentDiscarded", { application: name }),
        variant: "success",
      });
    },
    (error) => {
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      });
    }
  );

  const { mutate: deleteReview } = useDeleteReviewMutation(
    (name) => {
      pushNotification({
        title: t("toastr.success.reviewDiscarded", { application: name }),
        variant: "success",
      });
    },
    (error) => {
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      });
    }
  );

  const { mutate: bulkDeleteApplication } = useBulkDeleteApplicationMutation(
    () => {
      pushNotification({
        title: t("toastr.success.applicationDeleted", {
          appName: application?.name,
        }),
        variant: "success",
      });
      history.push(DevPaths.applications);
    },
    (error) => {
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      });
    }
  );

  const { mutate: cancelTask } = useCancelTaskMutation(
    () => {
      pushNotification({
        title: t("agentic.applicationDetail.taskCanceled"),
        variant: "info",
      });
    },
    () => {
      pushNotification({
        title: t("agentic.applicationDetail.taskCancelFailed"),
        variant: "danger",
      });
    }
  );

  if (applicationsFetchError != null && !application) {
    return (
      <PageSection hasBodyWrapper={false}>
        <BreadCrumbPath breadcrumbs={breadcrumbs} />
        {isNotFound ? (
          <Alert
            variant={AlertVariant.warning}
            title={t("agentic.applicationDetail.notFound")}
          >
            {t("agentic.applicationDetail.notFoundDescription")}
          </Alert>
        ) : (
          <Alert
            variant={AlertVariant.danger}
            title={t("agentic.applicationDetail.loadError")}
          >
            {isAxiosError(applicationsFetchError) &&
              getAxiosErrorMessage(applicationsFetchError)}
          </Alert>
        )}
      </PageSection>
    );
  }

  const actionItems = application
    ? filterAndAddSeparator(
        (index) => (
          <Divider key={`sep-${index}`} component={DividerVariant.li} />
        ),
        [
          [
            applicationWriteAccess && (
              <DropdownItem key="edit" onClick={() => setIsEditModalOpen(true)}>
                {t("actions.edit")}
              </DropdownItem>
            ),
          ],
          [
            assessmentWriteAccess && (
              <DropdownItem
                key="assess"
                onClick={() =>
                  history.push(
                    formatPath(DevPaths.applicationAssessmentActions, {
                      applicationId: application.id,
                    })
                  )
                }
              >
                {t("actions.assess")}
              </DropdownItem>
            ),
            assessmentWriteAccess &&
              (application.assessments?.length ?? 0) > 0 && (
                <DropdownItem
                  key="discard-assessment"
                  onClick={() => setIsDiscardAssessmentOpen(true)}
                >
                  {t("actions.discardAssessment")}
                </DropdownItem>
              ),
            reviewsWriteAccess && (
              <DropdownItem
                key="review"
                onClick={() =>
                  history.push(
                    formatPath(DevPaths.applicationsReview, {
                      applicationId: application.id,
                    })
                  )
                }
              >
                {t("actions.review")}
              </DropdownItem>
            ),
            reviewsWriteAccess && application.review && (
              <DropdownItem
                key="discard-review"
                onClick={() => setIsDiscardReviewOpen(true)}
              >
                {t("actions.discardReview")}
              </DropdownItem>
            ),
          ],
          [
            dependenciesWriteAccess && (
              <DropdownItem
                key="dependencies"
                onClick={() => setIsDependenciesModalOpen(true)}
              >
                {t("actions.manageDependencies")}
              </DropdownItem>
            ),
            credentialsReadAccess && applicationWriteAccess && (
              <DropdownItem
                key="credentials"
                onClick={() => setIsCredentialsModalOpen(true)}
              >
                {t("actions.manageCredentials")}
              </DropdownItem>
            ),
          ],
          [
            analysesReadAccess && !!application.tasks.currentAnalyzer && (
              <DropdownItem
                key="analysis-details"
                onClick={() => {
                  const taskId = application.tasks.currentAnalyzer?.id;
                  if (taskId) {
                    history.push(
                      formatPath(DevPaths.applicationsAnalysisDetails, {
                        applicationId: application.id,
                        taskId,
                      })
                    );
                  }
                }}
              >
                {t("actions.analysisDetails")}
              </DropdownItem>
            ),
            tasksReadAccess &&
              tasksWriteAccess &&
              isTaskCancellable(application) && (
                <DropdownItem
                  key="cancel-analysis"
                  onClick={() => setIsCancelOpen(true)}
                >
                  {t("actions.cancelTasks")}
                </DropdownItem>
              ),
          ],
          [
            applicationWriteAccess && tasksWriteAccess && (
              <DropdownItem
                key="retrieve-configs"
                isDisabled={!application.isReadyForRetrieveConfigurations}
                onClick={() => setIsRetrieveConfigOpen(true)}
              >
                {t("actions.retrieveConfigurations")}
              </DropdownItem>
            ),
            applicationWriteAccess && tasksWriteAccess && (
              <DropdownItem
                key="generate-assets"
                isDisabled={!application.isReadyForGenerateAssets}
                onClick={() => setIsGenerateAssetsOpen(true)}
              >
                {t("actions.generateAssets")}
              </DropdownItem>
            ),
          ],
          [
            applicationWriteAccess && (
              <DropdownItem
                key="delete"
                isDanger
                onClick={() => setIsDeleteOpen(true)}
              >
                {t("actions.delete")}
              </DropdownItem>
            ),
          ],
        ]
      )
    : [];

  return (
    <ConditionalRender
      when={isFetchingApplications && !application}
      then={<AppPlaceholder />}
    >
      {application && (
        <>
          <PageSection hasBodyWrapper={false}>
            {applicationsFetchError != null && (
              <Alert
                isInline
                variant={AlertVariant.danger}
                title={t("agentic.applicationDetail.loadError")}
              >
                {isAxiosError(applicationsFetchError) &&
                  getAxiosErrorMessage(applicationsFetchError)}
              </Alert>
            )}
            <PageHeader
              title={application.name}
              breadcrumbs={breadcrumbs}
              btnActions={
                <Dropdown
                  isOpen={isActionsOpen}
                  onOpenChange={setIsActionsOpen}
                  onSelect={() => setIsActionsOpen(false)}
                  popperProps={{ position: "right" }}
                  toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      aria-label={t("agentic.applicationDetail.actions")}
                      variant="secondary"
                      onClick={() => setIsActionsOpen((o) => !o)}
                      isExpanded={isActionsOpen}
                    >
                      {t("agentic.applicationDetail.actions")}
                    </MenuToggle>
                  )}
                >
                  <DropdownList>{actionItems}</DropdownList>
                </Dropdown>
              }
            />
          </PageSection>

          <PageSection hasBodyWrapper={false} type="tabs">
            <Tabs
              activeKey={activeTab}
              onSelect={(_e, key) => setActiveTab(key)}
              aria-label={t("agentic.applicationDetail.tabsLabel")}
            >
              {APP_DETAIL_TABS.map((tab) => (
                <Tab
                  key={tab}
                  eventKey={tab}
                  tabContentId={panelId(tab)}
                  title={<TabTitleText>{t(tabTitleKeys[tab])}</TabTitleText>}
                />
              ))}
            </Tabs>
          </PageSection>

          <PageSection hasBodyWrapper={false}>
            <TabContent
              id={panelId(activeTab)}
              aria-label={t(tabTitleKeys[activeTab])}
            >
              {activeTab === "details" && (
                <TabDetailsContent
                  application={application}
                  onEditClick={
                    applicationWriteAccess
                      ? () => setIsEditModalOpen(true)
                      : undefined
                  }
                />
              )}
              {activeTab === "tags" && (
                <TabTagsContent application={application} />
              )}
              {activeTab === "reports" && (
                <TabReportsContent application={application} />
              )}
              {activeTab === "review" && (
                <DrawerTabContent>
                  <ReviewFields application={application} />
                </DrawerTabContent>
              )}
              {activeTab === "tasks" && (
                <TabTasksContent application={application} />
              )}
              {activeTab === "platform" && (
                <TabPlatformContent application={application} />
              )}
              {activeTab === MIGRATION_TAB && (
                <MigrationTab
                  application={application}
                  applicationId={applicationId}
                  linkCrumbs={linkCrumbs}
                />
              )}
              {activeTab === "plan-runs" && (
                <PlanRunsTab
                  linkCrumbs={linkCrumbs}
                  applicationId={applicationId}
                />
              )}
              {activeTab === "skills" && (
                <SkillsTab
                  linkCrumbs={linkCrumbs}
                  applicationId={applicationId}
                  archetypes={application.archetypes ?? []}
                />
              )}
            </TabContent>
          </PageSection>

          <ApplicationFormModal
            isOpen={isEditModalOpen}
            application={application}
            onClose={() => setIsEditModalOpen(false)}
          />

          <ApplicationIdentityModal
            applications={isCredentialsModalOpen ? [application] : null}
            onClose={() => setIsCredentialsModalOpen(false)}
          />

          <RetrieveConfigWizard
            key={isRetrieveConfigOpen ? "retrieve-open" : "retrieve-closed"}
            applications={isRetrieveConfigOpen ? [application] : undefined}
            isOpen={isRetrieveConfigOpen}
            onClose={() => setIsRetrieveConfigOpen(false)}
          />

          <GenerateAssetsWizard
            key={isGenerateAssetsOpen ? "generate-open" : "generate-closed"}
            application={isGenerateAssetsOpen ? application : undefined}
            isOpen={isGenerateAssetsOpen}
            onClose={() => setIsGenerateAssetsOpen(false)}
          />

          <Modal
            isOpen={isDependenciesModalOpen}
            variant="medium"
            onClose={() => setIsDependenciesModalOpen(false)}
          >
            <ModalHeader
              title={t("composed.manageDependenciesFor", {
                what: application.name,
              })}
            />
            <ModalBody>
              <ApplicationDependenciesForm
                application={application._}
                onCancel={() => setIsDependenciesModalOpen(false)}
              />
            </ModalBody>
          </Modal>

          <ConfirmDialog
            title={t("dialog.title.deleteWithName", {
              what: t("terms.application").toLowerCase(),
              name: application.name,
            })}
            titleIconVariant="warning"
            isOpen={isDeleteOpen}
            message={t("dialog.message.delete")}
            confirmBtnVariant={ButtonVariant.danger}
            confirmBtnLabel={t("actions.delete")}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={() => setIsDeleteOpen(false)}
            onClose={() => setIsDeleteOpen(false)}
            onConfirm={() => {
              bulkDeleteApplication({ ids: [applicationId] });
              setIsDeleteOpen(false);
            }}
          />

          <ConfirmDialog
            title={t("dialog.title.cancelWithName", {
              what: t("terms.task").toLowerCase(),
              name: application.name,
            })}
            titleIconVariant="warning"
            isOpen={isCancelOpen}
            message={t("dialog.message.cancel")}
            confirmBtnVariant={ButtonVariant.danger}
            confirmBtnLabel={t("actions.cancelTasks")}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={() => setIsCancelOpen(false)}
            onClose={() => setIsCancelOpen(false)}
            onConfirm={() => {
              const taskId = application.tasks.currentAnalyzer?.id;
              if (taskId) cancelTask(taskId);
              setIsCancelOpen(false);
            }}
          />

          <ConfirmDialog
            title={t("dialog.title.discard", {
              what: t("terms.assessment").toLowerCase(),
            })}
            titleIconVariant="warning"
            isOpen={isDiscardAssessmentOpen}
            message={
              <span>
                <Trans
                  i18nKey="dialog.message.discardAssessment"
                  values={{ applicationName: application.name }}
                />
              </span>
            }
            confirmBtnVariant={ButtonVariant.primary}
            confirmBtnLabel={t("actions.continue")}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={() => setIsDiscardAssessmentOpen(false)}
            onClose={() => setIsDiscardAssessmentOpen(false)}
            onConfirm={() => {
              application.assessments?.forEach((assessment) => {
                deleteAssessment({
                  assessmentId: assessment.id,
                  applicationName: application.name,
                });
              });
              setIsDiscardAssessmentOpen(false);
            }}
          />

          <ConfirmDialog
            title={t("dialog.title.discard", {
              what: t("terms.review").toLowerCase(),
            })}
            titleIconVariant="warning"
            isOpen={isDiscardReviewOpen}
            message={
              <span>
                <Trans
                  i18nKey="dialog.message.discardReview"
                  values={{ applicationName: application.name }}
                />
              </span>
            }
            confirmBtnVariant={ButtonVariant.primary}
            confirmBtnLabel={t("actions.continue")}
            cancelBtnLabel={t("actions.cancel")}
            onCancel={() => setIsDiscardReviewOpen(false)}
            onClose={() => setIsDiscardReviewOpen(false)}
            onConfirm={() => {
              if (application.review) {
                deleteReview({
                  id: application.review.id,
                  name: application.name,
                });
              }
              setIsDiscardReviewOpen(false);
            }}
          />
        </>
      )}
    </ConditionalRender>
  );
};

export default ApplicationDetail;
