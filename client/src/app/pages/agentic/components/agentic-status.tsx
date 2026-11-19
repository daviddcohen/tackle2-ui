import * as React from "react";
import { LocationDescriptor } from "history";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Content, Stack, StackItem } from "@patternfly/react-core";
import {
  BanIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InProgressIcon,
  MinusCircleIcon,
  NotStartedIcon,
  PendingIcon,
} from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import {
  ApplicationMigrationDisplayStatus,
  ApplicationPreflightStatus,
  ConfigurationCheck,
  ConfigurationCheckStatus,
  ControllerRunPhase,
  VerificationStatus,
} from "@app/agentic";
import { IconedStatus } from "@app/components/Icons/IconedStatus";

/**
 * The one presentation of agentic statuses: an icon and text through `IconedStatus`, never a colored
 * `Label`. `status` is the PF `Icon` status; without one the icon stays grey,
 * which is how every state that needs no attention reads (Pending, Ready to
 * start, Blocked, Not configured, Not evaluated). Danger is reserved for
 * failures.
 */

export interface StatusPresentation {
  /** i18n key of the label; filters and counts read it too, so all say the same. */
  labelKey: string;
  status?: "info" | "success" | "warning" | "danger";
  icon: React.ComponentType;
}

/** Aggregate of a plan's configuration checks. */
export type ConfigurationAggregate = "checksPassed" | "issues" | "notEvaluated";

const pending: StatusPresentation = {
  labelKey: "agentic.runStatus.pending",
  icon: PendingIcon,
};
const running: StatusPresentation = {
  labelKey: "agentic.runStatus.running",
  status: "info",
  icon: InProgressIcon,
};
const succeeded: StatusPresentation = {
  labelKey: "agentic.runStatus.succeeded",
  status: "success",
  icon: CheckCircleIcon,
};
const failed: StatusPresentation = {
  labelKey: "agentic.runStatus.failed",
  status: "danger",
  icon: ExclamationCircleIcon,
};
const actionRequired: StatusPresentation = {
  labelKey: "agentic.runStatus.awaitingApproval",
  status: "warning",
  icon: ExclamationTriangleIcon,
};

export const statusPresentation: {
  run: Record<ControllerRunPhase, StatusPresentation>;
  migration: Record<ApplicationMigrationDisplayStatus, StatusPresentation>;
  verification: Record<VerificationStatus, StatusPresentation>;
  configuration: Record<
    ConfigurationCheckStatus | ConfigurationAggregate,
    StatusPresentation
  >;
} = {
  // 5.1 Run and stage. "Action required" is the only name for "a human must act".
  run: {
    Pending: pending,
    Running: running,
    Succeeded: succeeded,
    Failed: failed,
    AwaitingApproval: actionRequired,
  },
  // 5.2 Application migration.
  migration: {
    notConfigured: {
      labelKey: "agentic.migrationStatus.notConfigured",
      icon: MinusCircleIcon,
    },
    preflightReady: {
      labelKey: "agentic.migrationStatus.preflightReady",
      icon: NotStartedIcon,
    },
    preflightBlocked: {
      labelKey: "agentic.migrationStatus.preflightBlocked",
      icon: BanIcon,
    },
    reviewRequired: {
      labelKey: "agentic.migrationStatus.reviewRequired",
      status: "warning",
      icon: ExclamationTriangleIcon,
    },
    pending,
    running,
    actionRequired,
    succeeded,
    failed,
  },
  // 5.3 Verification (models and model providers).
  verification: {
    verified: {
      labelKey: "agentic.verificationStatus.verified",
      status: "success",
      icon: CheckCircleIcon,
    },
    pending: {
      labelKey: "agentic.verificationStatus.pending",
      icon: PendingIcon,
    },
    unreachable: {
      labelKey: "agentic.verificationStatus.unreachable",
      status: "danger",
      icon: ExclamationCircleIcon,
    },
  },
  // 5.4 Configuration checks, one check and the aggregate.
  configuration: {
    passed: {
      labelKey: "agentic.configurationStatus.passed",
      status: "success",
      icon: CheckCircleIcon,
    },
    issue: {
      labelKey: "agentic.configurationStatus.issue",
      status: "warning",
      icon: ExclamationTriangleIcon,
    },
    notEvaluated: {
      labelKey: "agentic.configurationStatus.notEvaluated",
      icon: MinusCircleIcon,
    },
    checksPassed: {
      labelKey: "agentic.configurationStatus.checksPassed",
      status: "success",
      icon: CheckCircleIcon,
    },
    issues: {
      labelKey: "agentic.configurationStatus.issues",
      status: "warning",
      icon: ExclamationTriangleIcon,
    },
  },
};

/** Preflight outcome of one application, as its migration status. */
export const preflightDisplayStatus: Record<
  ApplicationPreflightStatus,
  ApplicationMigrationDisplayStatus
> = {
  ready: "preflightReady",
  blocked: "preflightBlocked",
  reviewRequired: "reviewRequired",
};

/**
 * Any check with an issue gives "{n} issues"; otherwise any check not
 * evaluated gives "Not evaluated"; only when every check passed, "Checks
 * passed".
 */
export const getConfigurationAggregate = (
  checks: ConfigurationCheck[]
): ConfigurationAggregate => {
  if (checks.some((check) => check.status === "issue")) return "issues";
  if (checks.some((check) => check.status === "notEvaluated")) {
    return "notEvaluated";
  }
  return "checksPassed";
};

export interface AgenticStatusProps {
  /**
   * Makes the status text a router `Link` to this target, when the status
   * navigates (the inventory Migration column). The words stay the
   * status label: a check name is its own cell, never the status text.
   */
  to?: LocationDescriptor;
  /** Subtle small second line under the status, for example a reason. No separators. */
  supportingText?: React.ReactNode;
}

const PresentedStatus: React.FC<
  AgenticStatusProps & {
    /** Undefined only for a value outside the domain union (a newer server). */
    presentation: StatusPresentation | undefined;
    value: string;
    count?: number;
  }
> = ({ presentation, value, count, to, supportingText }) => {
  const { t } = useTranslation();
  // An unknown value reads as itself with IconedStatus's unknown icon.
  const text =
    presentation == null
      ? value
      : t(presentation.labelKey, count != null ? { count } : undefined);
  const label = to != null ? <Link to={to}>{text}</Link> : text;
  const iconed =
    presentation == null ? (
      <IconedStatus label={label} />
    ) : (
      <IconedStatus
        status={presentation.status}
        icon={<presentation.icon />}
        label={label}
      />
    );
  if (supportingText == null || supportingText === "") return iconed;
  return (
    <Stack>
      <StackItem>{iconed}</StackItem>
      <StackItem>
        <Content component="small" className={textStyles.textColorSubtle}>
          {supportingText}
        </Content>
      </StackItem>
    </Stack>
  );
};

/** Run, stage and agent test run status (5.1). */
export const RunStatus: React.FC<
  AgenticStatusProps & { status: ControllerRunPhase }
> = ({ status, ...props }) => (
  <PresentedStatus
    presentation={statusPresentation.run[status]}
    value={status}
    {...props}
  />
);

/**
 * Application migration status (5.2). Blocked and Review before start take
 * the server's reason as `supportingText` when the caller has one.
 */
export const MigrationStatus: React.FC<
  AgenticStatusProps & { status: ApplicationMigrationDisplayStatus }
> = ({ status, ...props }) => (
  <PresentedStatus
    presentation={statusPresentation.migration[status]}
    value={status}
    {...props}
  />
);

/** Model and model provider verification (5.3); `statusReason` goes in `supportingText`. */
export const VerificationStatusText: React.FC<
  AgenticStatusProps & { status: VerificationStatus }
> = ({ status, ...props }) => (
  <PresentedStatus
    presentation={statusPresentation.verification[status]}
    value={status}
    {...props}
  />
);

/** One configuration check (`status`) or the aggregate of a plan's checks (`checks`) (5.4). */
export const ConfigurationStatus: React.FC<
  AgenticStatusProps &
    (
      | { status: ConfigurationCheckStatus; checks?: never }
      | { checks: ConfigurationCheck[]; status?: never }
    )
> = ({ status, checks, ...props }) => {
  if (checks == null) {
    return (
      <PresentedStatus
        presentation={statusPresentation.configuration[status]}
        value={status}
        {...props}
      />
    );
  }
  const aggregate = getConfigurationAggregate(checks);
  return (
    <PresentedStatus
      presentation={statusPresentation.configuration[aggregate]}
      value={aggregate}
      count={
        aggregate === "issues"
          ? checks.filter((check) => check.status === "issue").length
          : undefined
      }
      {...props}
    />
  );
};
