import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { object, string } from "yup";
import {
  Button,
  ButtonVariant,
  FileUpload,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@patternfly/react-core";

import { SkillRequest } from "@app/agentic";
import { HookFormPFTextInput } from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useCreateSkillMutation, useFetchSkills } from "@app/queries/agentic";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

interface ImportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  content: string;
}

/** The first markdown heading, else the file name without its extension. */
export const parseSkillName = (filename: string, content: string): string => {
  const heading = content
    .split("\n")
    .find((line) => line.trim().startsWith("# "));
  if (heading) {
    return heading.replace(/^\s*#+\s*/, "").trim();
  }
  return filename.replace(/\.[^.]+$/, "").trim();
};

/**
 * Creates an inline Skill from a markdown or text file. The name is prefilled
 * from the file and stays editable, with the same rules as the Skill form.
 */
export const ImportSkillModal: React.FC<ImportSkillModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      id="import-skill-modal"
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-label={t("agentic.skill.importFile")}
    >
      {/* mounted only while open, so every opening starts empty */}
      {isOpen && <ImportSkillModalContent onClose={onClose} />}
    </Modal>
  );
};

const ImportSkillModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { skills } = useFetchSkills();

  const [filename, setFilename] = React.useState("");
  // FileUpload reads the file asynchronously with the handlers of the render
  // that started the read, so the name travels in a ref, not in state.
  const loadingFileName = React.useRef("");
  const [isFileLoading, setIsFileLoading] = React.useState(false);

  const schema = object({
    name: string()
      .trim()
      .required(t("agentic.skill.validation.nameRequired"))
      .min(3, t("agentic.skill.validation.nameMinimum"))
      .max(120, t("agentic.skill.validation.nameMaximum"))
      .test(
        "duplicate-name",
        t("agentic.skill.validation.nameDuplicate"),
        (value) => duplicateNameCheck(skills, null, value ?? "")
      ),
    content: string()
      .trim()
      .required(t("agentic.skill.validation.contentRequired")),
  });

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isValid },
  } = useForm<FormValues>({
    defaultValues: { name: "", content: "" },
    resolver: yupResolver(schema),
    mode: "all",
  });
  const content = useWatch({ control, name: "content" });

  const onImportSuccess = () => {
    pushNotification({
      title: t("agentic.skill.importSuccess"),
      variant: "success",
    });
    onClose();
  };
  const onImportError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: createSkill, isPending: isImporting } =
    useCreateSkillMutation(onImportSuccess, onImportError);

  const onSubmit = (values: FormValues) => {
    const payload: SkillRequest = {
      name: values.name.trim(),
      description: "",
      sourceType: "inline",
      content: values.content.trim(),
    };
    createSkill(payload);
  };

  const onFileLoaded = (text: string) => {
    setValue("content", text, { shouldDirty: true, shouldValidate: true });
    setValue("name", parseSkillName(loadingFileName.current, text), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  return (
    <>
      <ModalHeader title={t("agentic.skill.importFile")} />
      <ModalBody>
        <Form id="import-skill-form" onSubmit={handleSubmit(onSubmit)}>
          <FormGroup
            label={t("agentic.skill.importFileUpload")}
            isRequired
            fieldId="skill-file-upload"
          >
            <FileUpload
              id="skill-file-upload"
              type="text"
              value={content}
              filename={filename}
              filenamePlaceholder={t(
                "agentic.skill.importFileUploadPlaceholder"
              )}
              onFileInputChange={(_event, file) => {
                loadingFileName.current = file.name;
                setFilename(file.name);
              }}
              onDataChange={(_event, value) => onFileLoaded(value)}
              onTextChange={(_event, value) =>
                setValue("content", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              isLoading={isFileLoading}
              onReadStarted={() => setIsFileLoading(true)}
              onReadFinished={() => setIsFileLoading(false)}
              onClearClick={() => {
                setFilename("");
                reset();
              }}
              browseButtonText={t("agentic.skill.importFileUploadBrowse")}
              allowEditingUploadedText
            />
          </FormGroup>
          <HookFormPFTextInput
            control={control}
            name="name"
            label={t("terms.name")}
            fieldId="import-skill-name"
            helperText={t("agentic.skill.importFileDescription")}
            isRequired
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form="import-skill-form"
          variant={ButtonVariant.primary}
          isDisabled={!isValid || isFileLoading || isImporting}
          isLoading={isImporting}
        >
          {t("agentic.skill.importConfirm")}
        </Button>
        <Button variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
