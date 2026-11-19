import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { PageSection } from "@patternfly/react-core";

import { DEFAULT_REFETCH_INTERVAL } from "@app/Constants";
import { PageHeader, PageHeaderProps } from "@app/components/PageHeader";
import {
  DocumentId,
  SimpleDocumentViewer,
} from "@app/components/simple-document-viewer";
import { TaskStates, useFetchTaskByID } from "@app/queries/tasks";
import "@app/components/simple-document-viewer/SimpleDocumentViewer.css";

export const TaskDetailsBase: FC<{
  breadcrumbs: PageHeaderProps["breadcrumbs"];
  formatTitle: (taskName: string) => string;
  detailsPath: string;
  formatAttachmentPath: (attachmentId: number | string) => string;
  taskId: number;
  attachmentId?: string;
}> = ({
  breadcrumbs,
  formatTitle,
  detailsPath,
  formatAttachmentPath,
  taskId,
  attachmentId,
}) => {
  const { t } = useTranslation();

  const { search } = useLocation();
  const hasMergedParam = new URLSearchParams(search).has("merged");

  const history = useHistory();
  const onDocumentChange = (documentId: DocumentId) =>
    typeof documentId === "number"
      ? history.push(formatAttachmentPath(documentId))
      : history.push({
          pathname: detailsPath,
          search: documentId === "MERGED_VIEW" ? "?merged=true" : undefined,
        });

  // Poll the task (state, attachment list) and the shown document while the
  // task can still change. Polling stops at a terminal state or on an error.
  const [refetchInterval, setRefetchInterval] = useState<number | false>(false);
  const {
    task,
    fetchError,
    refetch: refetchTask,
  } = useFetchTaskByID(taskId, refetchInterval);
  const isLive =
    task != null &&
    fetchError == null &&
    !TaskStates.Terminal.includes(task.state ?? "");
  const nextRefetchInterval = isLive ? DEFAULT_REFETCH_INTERVAL : false;
  if (nextRefetchInterval !== refetchInterval) {
    // the interval depends on the fetched task, so adjust it while rendering
    setRefetchInterval(nextRefetchInterval);
  }

  const taskName: string = task?.name ?? t("terms.unknown");
  const attachmentName = task?.attached?.find(
    ({ id }) => String(id) === attachmentId
  )?.name;
  const resolvedAttachmentId = attachmentName
    ? Number(attachmentId)
    : undefined;
  const resolvedLogMode = hasMergedParam ? "MERGED_VIEW" : "LOG_VIEW";

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <PageHeader
          title={formatTitle(taskName)}
          breadcrumbs={[
            ...breadcrumbs,
            ...(attachmentName && attachmentId
              ? [
                  {
                    title: t("terms.attachments"),
                  },
                  {
                    title: attachmentName,
                    path: formatAttachmentPath(attachmentId),
                  },
                ]
              : []),
          ]}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled>
        <div
          style={{
            backgroundColor:
              "var(--pf-t--global--background--color--primary--default)",
          }}
          className="simple-task-viewer-container"
        >
          <SimpleDocumentViewer
            taskId={task ? taskId : undefined}
            documentId={resolvedAttachmentId || resolvedLogMode}
            attachments={task?.attached ?? []}
            onDocumentChange={onDocumentChange}
            refetchInterval={refetchInterval}
            onRefresh={refetchTask}
            height="full"
          />
        </div>
      </PageSection>
    </>
  );
};
