import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor, Language } from "@patternfly/react-code-editor";
import { EmptyState, EmptyStateVariant, Spinner } from "@patternfly/react-core";

import "./SimpleDocumentViewer.css";
import { TaskAttachment } from "@app/api/models";
import {
  useFetchTaskAttachmentById,
  useFetchTaskByIdAndFormat,
} from "@app/queries/tasks";

import SimpleSelect from "../FilterToolbar/components/SimpleSelect";

import { LanguageToggle } from "./LanguageToggle";
import { RefreshControl } from "./RefreshControl";
import { CodeEditorInstance, useKeepEditorPlace } from "./follow-tail";

export { Language } from "@patternfly/react-code-editor";

export interface Document {
  id: DocumentId;
  name: string;
  description?: string;
  languages: Language[];
  downloadFilename: string;
}

export interface ISimpleDocumentViewerProps {
  /** The id of the task to display, or `undefined` to display the empty state. */
  taskId: number | undefined;

  /**
   * The document ID to display - number for task attachment ID, string values for
   * other viewing modes.  Defaults to basic task view (LOG_VIEW).
   */
  documentId: DocumentId | undefined;

  /** Task attachments */
  attachments: TaskAttachment[];

  /**
   * Height of the document viewer, or `"full"` to take up all of the available
   * vertical space.  Defaults to "450px".
   */
  height?: string | "full";

  /** Callback triggered when user selects a new document to display */
  onDocumentChange?: (documentId: DocumentId) => void;

  /**
   * Poll the shown document at this interval, for a document that is still
   * growing. When it changes back to `false`, the document is fetched once more
   * so its final content is shown. Off by default.
   */
  refetchInterval?: number | false;

  /** Callback triggered when the user asks for a refresh, after the document refetch */
  onRefresh?: () => void;
}

export type DocumentId = number | "LOG_VIEW" | "MERGED_VIEW";

const useDocuments = ({
  taskId,
  selectedId,
  currentLanguage,
  refetchInterval,
}: {
  taskId?: number;
  selectedId: DocumentId;
  currentLanguage: Language;
  refetchInterval: number | false;
}) => {
  const { task, refetch: refetchTask } = useFetchTaskByIdAndFormat({
    taskId,
    format: currentLanguage === Language.yaml ? "yaml" : "json",
    enabled:
      !!taskId && (selectedId === "LOG_VIEW" || selectedId === "MERGED_VIEW"),
    merged: selectedId === "MERGED_VIEW",
    refetchInterval,
  });

  const isAttachment = typeof selectedId === "number";
  const { attachment, refetch: refetchAttachment } = useFetchTaskAttachmentById(
    {
      attachmentId: isAttachment ? selectedId : undefined,
      enabled: isAttachment,
      refetchInterval,
    }
  );

  return isAttachment
    ? { code: attachment, refetch: refetchAttachment }
    : { code: task, refetch: refetchTask };
};

/**
 * Fetch and then use the `@patternfly/react-code-editor` to display a document in
 * read-only mode with language highlighting applied.
 */
export const SimpleDocumentViewer = ({
  taskId,
  documentId = "LOG_VIEW",
  attachments,
  height = "450px",
  onDocumentChange,
  refetchInterval = false,
  onRefresh,
}: ISimpleDocumentViewerProps) => {
  const { t } = useTranslation();
  const configuredDocuments: Document[] = useMemo(
    () => [
      {
        id: "LOG_VIEW",
        name: "Log view",
        languages: [Language.yaml, Language.json],
        downloadFilename: `log-${taskId}`,
      },
      {
        id: "MERGED_VIEW",
        name: "Merged log view",
        description: "with inlined commands output",
        languages: [Language.yaml, Language.json],
        downloadFilename: `log-merged-${taskId}`,
      },
      ...attachments.map(({ id, name = "unknown" }) => ({
        id,
        name,
        languages: [
          (name.endsWith(".yaml") || name.endsWith(".yml")) && Language.yaml,
          name.endsWith(".json") && Language.json,
          Language.plaintext,
        ].filter(Boolean),
        downloadFilename: name.match(/\.(yaml|yml|json)$/)
          ? name.substring(0, name.lastIndexOf("."))
          : name,
      })),
    ],
    [attachments, taskId]
  );

  // Keep only the selected id in state, so the document list (attachments) can
  // change without re-creating the viewer and losing the language or scroll.
  const [selectedId, setSelectedId] = useState<DocumentId>(
    () =>
      (
        configuredDocuments.find(({ id }) => id === documentId) ??
        configuredDocuments[0]
      ).id
  );
  const selectedDocument =
    configuredDocuments.find(({ id }) => id === selectedId) ??
    configuredDocuments[0];
  const supportedLanguages = selectedDocument.languages;

  const [currentLanguage, setCurrentLanguage] = useState(
    supportedLanguages[0] ?? Language.plaintext
  );

  const editorRef = useRef<CodeEditorInstance>();

  const { code, refetch } = useDocuments({
    taskId,
    currentLanguage,
    selectedId: selectedDocument.id,
    refetchInterval,
  });

  // fetch once more when polling stops, so the final content is shown
  const wasPolling = useRef(refetchInterval !== false);
  useEffect(() => {
    if (wasPolling.current && refetchInterval === false) {
      refetch();
    }
    wasPolling.current = refetchInterval !== false;
  }, [refetchInterval, refetch]);

  // A refresh of the document it already shows keeps the reader's place.
  const keepPlace = useKeepEditorPlace(
    `${selectedDocument.id}/${currentLanguage}`,
    code
  );

  // move focus on first code change AFTER a new document was selected
  const focusedDocumentId = useRef<DocumentId>();
  const focusAndHomePosition = () => {
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setPosition({ column: 0, lineNumber: 1 });
    }
  };
  useEffect(() => {
    if (code && focusedDocumentId.current !== selectedDocument.id) {
      focusAndHomePosition();
      focusedDocumentId.current = selectedDocument.id;
    }
  }, [code, selectedDocument.id]);

  const showDocument = (doc: Document) => {
    setCurrentLanguage(doc.languages[0] ?? Language.plaintext);
    setSelectedId(doc.id);
  };

  // Follow the `documentId` prop when it changes, including an attachment id
  // that only resolves once the attachments are known (adjusting state while
  // rendering, see https://react.dev/learn/you-might-not-need-an-effect).
  const [appliedDocumentId, setAppliedDocumentId] = useState<DocumentId>();
  if (documentId !== appliedDocumentId) {
    const doc = configuredDocuments.find(({ id }) => id === documentId);
    if (doc) {
      setAppliedDocumentId(documentId);
      if (doc.id !== selectedDocument.id) {
        showDocument(doc);
      }
    }
  }

  const onSelect = (docId: string | number) => {
    const doc = configuredDocuments.find(({ id }) => id === docId);
    if (!doc || doc.id === selectedDocument.id) {
      return;
    }

    showDocument(doc);
    onDocumentChange?.(doc.id);
  };

  return (
    <CodeEditor
      className="simple-task-viewer-code"
      isCopyEnabled
      isDarkTheme
      isDownloadEnabled
      isLineNumbersVisible
      isReadOnly
      height={height === "full" ? "100%" : height}
      downloadFileName={selectedDocument.downloadFilename}
      language={currentLanguage}
      code={code}
      onEditorDidMount={(editor) => {
        editorRef.current = editor;
        keepPlace(editor);
      }}
      showEditor={code !== undefined}
      emptyState={
        <div className="simple-task-viewer-empty-state">
          <EmptyState
            headingLevel="h4"
            icon={Spinner}
            titleText={t("message.loadingCurrentLanguage", {
              currentLanguage,
            })}
            variant={EmptyStateVariant.sm}
            isFullHeight
            style={{ height: height === "full" ? "auto" : height }}
          ></EmptyState>
        </div>
      }
      customControls={[
        <div
          key="attachmentToggle"
          className="simple-task-viewer-attachment-toggle"
        >
          <SimpleSelect
            toggleId="attachmentToggle"
            toggleAriaLabel="Attachment toggle"
            isFullWidth
            options={configuredDocuments.map(({ id, name, description }) => ({
              value: id.toString(),
              label: name,
              optionProps: {
                description,
              },
            }))}
            value={selectedDocument?.id?.toString()}
            onSelect={(value) =>
              onSelect(Number.isInteger(Number(value)) ? Number(value) : value)
            }
          />
        </div>,
        <RefreshControl
          key="refresh"
          isVisible={code !== ""}
          refetch={() => {
            refetch();
            onRefresh?.();
          }}
        />,
        <LanguageToggle
          key="languageToggle"
          code={code}
          supportedLanguages={supportedLanguages}
          currentLanguage={currentLanguage}
          setCurrentLanguage={setCurrentLanguage}
        />,
      ]}
    />
  );
};
