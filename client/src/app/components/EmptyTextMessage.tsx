import * as React from "react";
import { useTranslation } from "react-i18next";
import { Content } from "@patternfly/react-core";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

export interface EmptyTextMessageProps {
  message?: string;
}

export const EmptyTextMessage: React.FC<EmptyTextMessageProps> = ({
  message,
}) => {
  const { t } = useTranslation();

  return (
    <Content component="p" className={textStyles.textColorSubtle}>
      <i>{message || t("terms.notAvailable")}</i>
    </Content>
  );
};
