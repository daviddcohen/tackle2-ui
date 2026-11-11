import * as React from "react";
import { useTranslation } from "react-i18next";
import { Content, Flex, FlexItem, Icon, Tooltip } from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

import { EntityRef, Gateway } from "@app/agentic";

export interface AgentModelProps {
  /** The agent's model reference: its name is always shown. */
  model: EntityRef;
  /** The model record, once the models query has it: adds the provider and the verification marker. */
  gateway?: Gateway;
  /** Provider inline after the name (a fact) instead of stacked under it (a table cell). */
  isInline?: boolean;
}

/**
 * An agent's model: the name, the provider as subtle text, and a warning
 * marker with the reason when the model is not verified, because agents
 * cannot use it then (guide 4.10, kit-status). Plain text: models have no
 * detail page (A8).
 */
export const AgentModel: React.FC<AgentModelProps> = ({
  model,
  gateway,
  isInline = false,
}) => {
  const { t } = useTranslation();
  const isUnverified =
    gateway != null && gateway.verificationStatus !== "verified";
  const name = isUnverified ? (
    <Flex
      spaceItems={{ default: "spaceItemsSm" }}
      flexWrap={{ default: "nowrap" }}
    >
      <FlexItem>{model.name}</FlexItem>
      <FlexItem>
        <Tooltip
          content={gateway.statusReason ?? t("agentic.agent.modelNotVerified")}
        >
          <Icon
            status="warning"
            aria-label={t("agentic.agent.modelNotVerifiedLabel")}
            tabIndex={0}
          >
            <ExclamationTriangleIcon />
          </Icon>
        </Tooltip>
      </FlexItem>
    </Flex>
  ) : (
    model.name
  );
  const provider = gateway?.provider.name;

  if (isInline) {
    return (
      <Flex spaceItems={{ default: "spaceItemsSm" }}>
        <FlexItem>{name}</FlexItem>
        {provider != null && (
          <FlexItem>
            <span className={textStyles.textColorSubtle}>{provider}</span>
          </FlexItem>
        )}
      </Flex>
    );
  }
  return (
    <div>
      {name}
      {provider != null && (
        <Content component="small" className={textStyles.textColorSubtle}>
          {provider}
        </Content>
      )}
    </div>
  );
};
