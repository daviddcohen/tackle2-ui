import * as React from "react";
import { dump } from "js-yaml";
import { useTranslation } from "react-i18next";
import { CodeEditor, Language } from "@patternfly/react-code-editor";
import {
  Alert,
  AlertActionLink,
  EmptyState,
  Spinner,
} from "@patternfly/react-core";
import codeEditorStyles from "@patternfly/react-styles/css/components/CodeEditor/code-editor";
import spacing from "@patternfly/react-styles/css/utilities/Spacing/spacing";

import "@app/components/simple-document-viewer/SimpleDocumentViewer.css";
import { ControllerRunPhase, StageAgentRun } from "@app/agentic";
import type { AgentRun } from "@app/api/agentic/contract";
import { LanguageToggle } from "@app/components/simple-document-viewer/LanguageToggle";
import { RefreshControl } from "@app/components/simple-document-viewer/RefreshControl";
import { useKeepEditorPlace } from "@app/components/simple-document-viewer/follow-tail";
import { useFetchAgentRunResource } from "@app/queries/agentic-observability";

import { LiveSentence } from "./live-status";
import { useBodyHeight } from "./use-body-height";

const LANGUAGES = [Language.yaml, Language.json];

/**
 * The resource as `oc get -o yaml` shows it: without `metadata.managedFields`,
 * which is server bookkeeping and can be longer than the rest.
 */
const toResourceDocument = (resource: AgentRun, language: Language): string => {
  const { managedFields: _managedFields, ...metadata } =
    resource.metadata as AgentRun["metadata"] & { managedFields?: unknown };
  const shown = { ...resource, metadata };
  return language === Language.json
    ? JSON.stringify(shown, null, 2)
    : dump(shown, { noRefs: true, lineWidth: -1 });
};

export interface AgentRunResourceProps {
  agentRun: StageAgentRun;
  /** The stage's status: the resource refreshes while the stage can change. */
  phase: ControllerRunPhase;
  /**
   * Height of the whole view in pixels: the editor gets what the live
   * sentence and its header leave. Default: it fills its parent.
   */
  height?: number;
}

/**
 * The stage's AgentRun resource as YAML or JSON, laid out like
 * the Task details document viewer: a read-only editor with copy, download,
 * refresh and the language toggle in its header. It refreshes while the
 * stage runs and keeps the reader's place (scroll and selection) when the
 * content changes.
 */
export const AgentRunResource: React.FC<AgentRunResourceProps> = ({
  agentRun,
  phase,
  height,
}) => {
  const { t } = useTranslation();
  const {
    agentRun: resource,
    isLoading,
    fetchError,
    refetch,
    lastUpdatedAt,
  } = useFetchAgentRunResource(agentRun.name, phase);
  const [language, setLanguage] = React.useState(Language.yaml);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const editorHeight = useBodyHeight(
    height,
    containerRef,
    codeEditorStyles.codeEditorCode
  );

  const code = React.useMemo(
    () =>
      resource != null ? toResourceDocument(resource, language) : undefined,
    [resource, language]
  );

  // A refresh of the same resource in the same language keeps the reader's
  // place; another resource (a retried stage's new AgentRun) or language
  // starts at the top.
  const keepPlace = useKeepEditorPlace(`${agentRun.name}/${language}`, code);

  const errorAlert = fetchError != null && (
    <Alert
      isInline
      variant="danger"
      title={t("agentic.agentRun.resource.errorTitle")}
      actionLinks={
        <AlertActionLink onClick={() => refetch()}>
          {t("agentic.agentRun.tryAgain")}
        </AlertActionLink>
      }
    />
  );
  if (errorAlert && resource == null) return errorAlert;

  const isLive = phase === "Running";

  // Laid out like Task details: the editor fills the rest of the page
  // (the panel and its PageSection are filled, see the stage page).
  return (
    <div ref={containerRef} className="simple-task-viewer-container">
      {/* A failed refresh keeps the last document, under the error. */}
      {errorAlert && <div className={spacing.mbSm}>{errorAlert}</div>}
      {isLive && (
        <div className={spacing.mbSm}>
          <LiveSentence updatedAt={lastUpdatedAt}>
            {t("agentic.agentRun.refreshesWhileRunning")}
          </LiveSentence>
        </div>
      )}
      <CodeEditor
        className="simple-task-viewer-code"
        isReadOnly
        isDarkTheme
        isLineNumbersVisible
        isCopyEnabled
        isDownloadEnabled
        copyButtonAriaLabel={t("agentic.agentRun.resource.copy")}
        copyButtonToolTipText={t("agentic.agentRun.resource.copy")}
        copyButtonSuccessTooltipText={t("agentic.agentRun.resource.copied")}
        downloadButtonAriaLabel={t("agentic.agentRun.download")}
        downloadButtonToolTipText={t("agentic.agentRun.download")}
        downloadFileName={agentRun.name}
        height={editorHeight != null ? `${editorHeight}px` : "100%"}
        language={language}
        code={code}
        showEditor={code != null}
        onEditorDidMount={keepPlace}
        emptyState={
          <div className="simple-task-viewer-empty-state">
            <EmptyState
              headingLevel="h2"
              icon={Spinner}
              titleText={t("agentic.agentRun.resource.loading")}
              variant="sm"
            />
          </div>
        }
        customControls={[
          <RefreshControl
            key="refresh"
            isVisible={!isLoading && code != null}
            refetch={() => refetch()}
            ariaLabel={t("agentic.agentRun.resource.refresh")}
            tooltip={t("agentic.agentRun.resource.refresh")}
          />,
          <LanguageToggle
            key="language"
            code={code}
            supportedLanguages={LANGUAGES}
            currentLanguage={language}
            setCurrentLanguage={setLanguage}
            ariaLabel={t("agentic.agentRun.resource.format")}
          />,
        ]}
      />
    </div>
  );
};
