import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Bullseye,
  Button,
  ButtonVariant,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@patternfly/react-core";

/**
 * Body and footer pieces shared by the target profile modals (create, edit,
 * manage generators, assign analysis profile), so they behave alike.
 */

/** Form footer: Save (or Create) and Cancel. Both wait while a save runs. */
export const TargetProfileModalFooter: React.FC<{
  formId: string;
  submitLabel?: string;
  canSubmit: boolean;
  isSaving: boolean;
  onCancel: () => void;
}> = ({ formId, submitLabel, canSubmit, isSaving, onCancel }) => {
  const { t } = useTranslation();
  return (
    <ModalFooter>
      <Button
        type="submit"
        form={formId}
        variant={ButtonVariant.primary}
        isDisabled={!canSubmit}
        // Still focusable while saving, so focus stays in the dialog.
        isAriaDisabled={isSaving}
        isLoading={isSaving || undefined}
      >
        {submitLabel ?? t("actions.save")}
      </Button>
      <Button
        type="button"
        variant={ButtonVariant.link}
        isDisabled={isSaving}
        onClick={onCancel}
      >
        {t("actions.cancel")}
      </Button>
    </ModalFooter>
  );
};

/** While the options a form needs load: a spinner, Save waits. */
export const TargetProfileModalLoading: React.FC<{
  submitLabel?: string;
  onCancel: () => void;
}> = ({ submitLabel, onCancel }) => {
  const { t } = useTranslation();
  return (
    <>
      <ModalBody>
        <Bullseye>
          <Spinner size="lg" aria-valuetext={t("terms.loading")} />
        </Bullseye>
      </ModalBody>
      <ModalFooter>
        <Button variant={ButtonVariant.primary} isDisabled>
          {submitLabel ?? t("actions.save")}
        </Button>
        <Button variant={ButtonVariant.link} onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};

/**
 * When nothing can be saved: an inline alert says why (and the way out) and
 * the footer is a single secondary Close.
 */
export const TargetProfileModalNotice: React.FC<{
  alert: React.ReactNode;
  onClose: () => void;
}> = ({ alert, onClose }) => {
  const { t } = useTranslation();
  return (
    <>
      <ModalBody>{alert}</ModalBody>
      <ModalFooter>
        <Button variant={ButtonVariant.secondary} onClick={onClose}>
          {t("actions.close")}
        </Button>
      </ModalFooter>
    </>
  );
};

/**
 * Focus on the form's first field once it is shown. The modal's own initial
 * focus (`elementToFocus`) only applies when it opens, so it misses a form
 * that replaces a spinner.
 */
export const useFocusOnMount = (selector: string) =>
  React.useEffect(() => {
    document.querySelector<HTMLElement>(selector)?.focus();
    // Once, when the form mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
