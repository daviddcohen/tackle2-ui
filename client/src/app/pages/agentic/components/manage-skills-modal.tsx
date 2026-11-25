import * as React from "react";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Bullseye,
  Button,
  ButtonVariant,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@patternfly/react-core";

import { isAgenticEnabled } from "@app/Constants";
import { DevPaths } from "@app/Paths";
import type { Skill } from "@app/agentic";
import { useHasSomeScopes } from "@app/auth";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import { MultiSelect } from "@app/components/FilterToolbar/components/MultiSelect";
import { HookFormPFGroupController } from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import {
  useFetchSkills,
  useUpdateApplicationSkillsMutation,
  useUpdateArchetypeSkillsMutation,
  useUpdateTargetProfileSkillsMutation,
} from "@app/queries/agentic";
import { skillsWriteScopes } from "@app/scopes";
import { isSameSet } from "@app/utils/agentic";
import { getAxiosErrorMessage } from "@app/utils/utils";

import { PICKER_MENU_HEIGHT, PICKER_MENU_POPPER } from "./picker-menu";

const MODAL_ID = "manage-skills-modal";
const TITLE_ID = "manage-skills-modal-title";
const DESCRIPTION_ID = "manage-skills-modal-description";
const FORM_ID = "manage-skills-form";
const SELECT_ID = "manage-skills-select";
const SAVE_ID = "manage-skills-save";

/** The owner whose attached skills are edited. */
export type ManageSkillsTarget =
  | { scope: "archetype"; id: number; name: string }
  | {
      scope: "targetProfile";
      id: number;
      name: string;
      archetype: { id: number; name: string };
    }
  | { scope: "application"; id: number; name: string };

/**
 * The id of the Manage skills button that edits `target` ("manage-skills-
 * archetype-1"): unique per group when one page shows several, and where
 * focus goes after a save when the element that opened the modal is gone.
 */
export const manageSkillsButtonId = (
  target: Pick<ManageSkillsTarget, "scope" | "id">
) => `manage-skills-${target.scope}-${target.id}`;

export interface ManageSkillsModalProps {
  /** The entity whose direct skills are edited; closed when null. */
  target: ManageSkillsTarget | null;
  onClose: () => void;
}

/**
 * Who may manage an entity's skills: the permission the skill form needs to
 * edit the same associations. Without the agentic API there are no skills.
 * Every placement uses it.
 */
export const useCanManageSkills = () => {
  const canWriteSkills = useHasSomeScopes(skillsWriteScopes);
  return isAgenticEnabled && canWriteSkills;
};

/** Ids of the skills attached to the target itself (server data). */
const directSkillIds = (skills: Skill[], target: ManageSkillsTarget) =>
  skills
    .filter((skill) =>
      skill.associations?.some(
        (association) =>
          association.scope === target.scope &&
          association.resource.id === target.id
      )
    )
    .map((skill) => skill.id);

/** Inside a menu or a dialog: not where focus returns to. */
const isTransient = (element: Element) =>
  element === document.body ||
  element.closest('[role="menu"], [role="dialog"]') != null;

/**
 * Remembers where focus was before the modal opened and puts it back on
 * close. A kebab item opens the modal after its menu closed, so the last
 * focus outside a menu is the kebab toggle. When that element is gone (an
 * empty state turned into a table after a save), focus moves to the
 * Manage skills button of the target's group.
 */
const useReturnFocus = (target: ManageSkillsTarget | null) => {
  const isOpen = target != null;
  const lastFocused = React.useRef<HTMLElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  // The last target's button id, kept after close for the fallback.
  const [groupButtonId, setGroupButtonId] = React.useState<string | null>(null);
  const targetButtonId = target != null ? manageSkillsButtonId(target) : null;
  if (targetButtonId != null && targetButtonId !== groupButtonId)
    setGroupButtonId(targetButtonId);

  React.useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !isTransient(event.target))
        lastFocused.current = event.target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const wasOpen = React.useRef(isOpen);
  React.useEffect(() => {
    let frame: number | undefined;
    if (isOpen && !wasOpen.current) {
      const active = document.activeElement;
      returnTo.current =
        active instanceof HTMLElement && !isTransient(active)
          ? active
          : lastFocused.current;
    } else if (!isOpen && wasOpen.current) {
      const element = returnTo.current;
      returnTo.current = null;
      // After the next render, when a table may have replaced the trigger.
      frame = window.requestAnimationFrame(() => {
        const destination = element?.isConnected
          ? element
          : groupButtonId != null
            ? document.getElementById(groupButtonId)
            : null;
        destination?.focus();
      });
    }
    wasOpen.current = isOpen;
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [isOpen, groupButtonId]);
};

/**
 * Manage the skills attached to an archetype, a target profile
 * or an application. Saving replaces the whole set; the same associations
 * are edited from the skill form. Mount it only for users who can manage
 * skills (`useCanManageSkills`): it listens to focus on the whole page.
 */
export const ManageSkillsModal: React.FC<ManageSkillsModalProps> = ({
  target,
  onClose,
}) => {
  useReturnFocus(target);
  // Mounted only while open, so every opening starts from the server data.
  return target ? (
    <ManageSkillsDialog
      key={`${target.scope}-${target.id}`}
      target={target}
      onClose={onClose}
    />
  ) : null;
};

const ManageSkillsDialog: React.FC<{
  target: ManageSkillsTarget;
  onClose: () => void;
}> = ({ target, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const SkillsLink = useLinkComponent(DevPaths.skills);
  const { skills, isLoading, isFetching, isSuccess, fetchError } =
    useFetchSkills();
  // The form starts from the set the server has now: cached skills may be
  // stale, and Save replaces the whole set. Later refetches do not reset it.
  const [hasFreshSkills, setHasFreshSkills] = React.useState(false);
  if (!hasFreshSkills && isSuccess && !isFetching) setHasFreshSkills(true);
  const isWaiting = isLoading || (!hasFreshSkills && isFetching);
  // A skill whose associations the server did not give makes the direct set
  // unknown, not empty: a save would drop associations it cannot see.
  const isDirectSetUnknown = skills.some(
    (skill) => skill.associations === undefined
  );

  // Profile names repeat across archetypes, so a profile is named with its
  // archetype.
  const name =
    target.scope === "targetProfile"
      ? t("agentic.skill.targetProfileOption", {
          profile: target.name,
          archetype: target.archetype.name,
        })
      : target.name;
  const onSuccess = () => {
    pushNotification({
      title: t("agentic.skill.manageSkills.saved", { name }),
      variant: "success",
    });
    onClose();
  };
  const onError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.skill.manageSkills.saveFailed", { name }),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
    // The picker was disabled while saving: keep focus inside the dialog,
    // on the button that retries.
    document.getElementById(SAVE_ID)?.focus();
  };
  const archetypeMutation = useUpdateArchetypeSkillsMutation(
    onSuccess,
    onError
  );
  const targetProfileMutation = useUpdateTargetProfileSkillsMutation(
    onSuccess,
    onError
  );
  const applicationMutation = useUpdateApplicationSkillsMutation(
    onSuccess,
    onError
  );
  const isSaving =
    archetypeMutation.isPending ||
    targetProfileMutation.isPending ||
    applicationMutation.isPending;

  const save = (skillIds: string[]) => {
    const refs = skillIds.map((id) => ({ id }));
    switch (target.scope) {
      case "archetype":
        archetypeMutation.mutate({ archetypeId: target.id, skills: refs });
        break;
      case "targetProfile":
        targetProfileMutation.mutate({
          archetypeId: target.archetype.id,
          targetProfileId: target.id,
          skills: refs,
        });
        break;
      case "application":
        applicationMutation.mutate({
          applicationId: target.id,
          skills: refs,
        });
        break;
    }
  };

  const closeButton = (
    <Button variant={ButtonVariant.secondary} onClick={onClose}>
      {t("actions.close")}
    </Button>
  );

  const errorState = (title: string) => (
    <>
      <ModalBody>
        <Alert variant="danger" isInline isPlain title={title} />
      </ModalBody>
      <ModalFooter>{closeButton}</ModalFooter>
    </>
  );

  const isReady =
    !isWaiting && isSuccess && skills.length > 0 && !isDirectSetUnknown;
  // Once the form is up it stays with the skills it was given: a background
  // refetch that fails (or changes the list) must not throw away the
  // unsaved selection.
  const [formSkills, setFormSkills] = React.useState<Skill[] | null>(null);
  if (formSkills == null && isReady) setFormSkills(skills);
  let content: React.ReactNode;
  if (formSkills != null) {
    content = (
      <ManageSkillsForm
        target={target}
        skills={formSkills}
        initialSkillIds={directSkillIds(formSkills, target)}
        isSaving={isSaving}
        onSave={save}
        onClose={onClose}
      />
    );
  } else if (isWaiting) {
    content = (
      <>
        <ModalBody>
          <Bullseye>
            <Spinner size="lg" aria-valuetext={t("terms.loading")} />
          </Bullseye>
        </ModalBody>
        <ModalFooter>
          <Button variant={ButtonVariant.primary} isDisabled>
            {t("actions.save")}
          </Button>
          <Button variant={ButtonVariant.link} onClick={onClose}>
            {t("actions.cancel")}
          </Button>
        </ModalFooter>
      </>
    );
  } else if (!isSuccess && fetchError != null) {
    content = errorState(t("agentic.skill.manageSkills.loadFailed"));
  } else if (isDirectSetUnknown) {
    content = errorState(t("agentic.skill.manageSkills.unavailable"));
  } else if (skills.length === 0) {
    content = (
      <>
        <ModalBody>
          <EmptyState variant="xs">
            <EmptyStateBody>
              {t("agentic.skill.manageSkills.empty")}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button
                  variant={ButtonVariant.link}
                  component={SkillsLink}
                  onClick={onClose}
                >
                  {t("agentic.skill.manageSkills.goToSkills")}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        </ModalBody>
        <ModalFooter>{closeButton}</ModalFooter>
      </>
    );
  }

  return (
    <Modal
      id={MODAL_ID}
      variant="medium"
      isOpen
      onClose={() => {
        if (!isSaving) onClose();
      }}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      // Other states keep the default: their first tabbable element.
      elementToFocus={formSkills != null ? `#${SELECT_ID}-input` : undefined}
    >
      <ModalHeader
        title={t("agentic.skill.manageSkills.titleFor", { name })}
        // The scope sentence the attached lists show for this owner.
        description={t(`agentic.skill.scopeSentence.${target.scope}`)}
        labelId={TITLE_ID}
        descriptorId={DESCRIPTION_ID}
      />
      {content}
    </Modal>
  );
};

interface ManageSkillsFormValues {
  skills: string[];
}

interface ManageSkillsFormProps {
  target: ManageSkillsTarget;
  skills: Skill[];
  /** Read when the form mounts only, so a background refetch keeps the selection. */
  initialSkillIds: string[];
  isSaving: boolean;
  onSave: (skillIds: string[]) => void;
  onClose: () => void;
}

const ManageSkillsForm: React.FC<ManageSkillsFormProps> = ({
  target,
  skills,
  initialSkillIds,
  isSaving,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [initial] = React.useState(initialSkillIds);
  const { control, handleSubmit, setValue } = useForm<ManageSkillsFormValues>({
    defaultValues: { skills: initial },
  });
  const selected = useWatch({ control, name: "skills" });
  // When the skills arrive after the modal opened, focus moves from the
  // close button to the picker. `elementToFocus` alone cannot: the focus
  // trap sets its initial focus when the modal opens, after this effect.
  React.useEffect(() => {
    document.getElementById(`${SELECT_ID}-input`)?.focus();
  }, []);
  const isChanged = !isSameSet(selected, initial);

  const options = React.useMemo<FilterSelectOptionProps[]>(
    () =>
      [...skills]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((skill) => {
          // How agents use it comes first: it decides what attaching does.
          const policy = t(
            `agentic.skill.loadPolicy.${skill.loadPolicy ?? "skill"}`
          );
          return {
            value: skill.id,
            label: skill.name,
            optionProps: {
              description: skill.description
                ? t("agentic.skill.manageSkills.optionDescription", {
                    policy,
                    description: skill.description,
                  })
                : policy,
            },
          };
        }),
    [skills, t]
  );

  const helper =
    target.scope === "targetProfile"
      ? t("agentic.skill.manageSkills.helper.targetProfile", {
          archetype: target.archetype.name,
        })
      : t(`agentic.skill.manageSkills.helper.${target.scope}`);

  const onSubmit = ({ skills: skillIds }: ManageSkillsFormValues) => {
    if (!isChanged || isSaving) return;
    onSave(skillIds);
  };

  return (
    <>
      <ModalBody>
        <Form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <HookFormPFGroupController
            control={control}
            name="skills"
            label={t("agentic.skill.manageSkills.field")}
            fieldId={`${SELECT_ID}-input`}
            helperText={helper}
            renderInput={({ field: { value } }) => (
              <MultiSelect
                toggleId={SELECT_ID}
                toggleAriaLabel={t("agentic.skill.manageSkills.placeholder")}
                ariaLabel={t("agentic.skill.manageSkills.field")}
                placeholderText={t("agentic.skill.manageSkills.placeholder")}
                options={options}
                values={value}
                isDisabled={isSaving}
                hasCheckbox
                hasBadge
                hasChips
                maxMenuHeight={PICKER_MENU_HEIGHT}
                popperProps={PICKER_MENU_POPPER}
                inputAriaLabel={t("agentic.skill.manageSkills.field")}
                inputAriaDescribedBy={`${SELECT_ID}-input-helper`}
                onSelect={(selection) => {
                  if (!selection || isSaving) return;
                  setValue(
                    "skills",
                    value.includes(selection)
                      ? value.filter((id) => id !== selection)
                      : [...value, selection],
                    { shouldDirty: true }
                  );
                }}
                onClear={() => {
                  if (isSaving) return;
                  setValue("skills", [], { shouldDirty: true });
                }}
              />
            )}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          id={SAVE_ID}
          type="submit"
          form={FORM_ID}
          variant={ButtonVariant.primary}
          isDisabled={!isChanged}
          // Still focusable while saving, so focus stays in the dialog.
          isAriaDisabled={isSaving}
          isLoading={isSaving || undefined}
        >
          {t("actions.save")}
        </Button>
        <Button
          type="button"
          variant={ButtonVariant.link}
          isDisabled={isSaving}
          onClick={onClose}
        >
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
