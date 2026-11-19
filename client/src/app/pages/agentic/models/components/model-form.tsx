import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { object, string } from "yup";
import {
  Alert,
  Button,
  ButtonVariant,
  Content,
  Form,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
} from "@patternfly/react-core";

import { AdminPaths } from "@app/Paths";
import { ModelProjection, ModelRequest } from "@app/agentic";
import { IdentityKind } from "@app/api/models";
import { FilterSelectOptionProps } from "@app/components/FilterToolbar/FilterToolbar";
import TypeaheadSelect from "@app/components/FilterToolbar/components/TypeaheadSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { useLinkComponent } from "@app/hooks/useLinkComponent";
import { statusPresentation } from "@app/pages/agentic/components/agentic-status";
import {
  useCreateGatewayMutation,
  useFetchAgents,
  useFetchAvailableModels,
  useFetchGateways,
  useFetchProviders,
  useUpdateGatewayMutation,
} from "@app/queries/agentic";
import { useFetchIdentities } from "@app/queries/identities";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

/** Ids of the form's modal title and description, for the Modal that hosts the form. */
export const MODEL_FORM_TITLE_ID = "model-form-title";
export const MODEL_FORM_DESCRIPTION_ID = "model-form-description";

/** Hub identity kinds that can hold a model provider's API key. */
export const MODEL_CREDENTIAL_KINDS: readonly IdentityKind[] = ["bearer"];

interface FormValues {
  name: string;
  description: string;
  providerId: string;
  model: string;
  credentialId: string;
}

interface ModelFormProps {
  model: ModelProjection | null;
  onClose: () => void;
}

export const ModelForm: React.FC<ModelFormProps> = ({ model, onClose }) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { gateways } = useFetchGateways();
  const { providers } = useFetchProviders();
  const { identities, isSuccess: isIdentitiesLoaded } = useFetchIdentities();
  const credentialsLink = useLinkComponent(AdminPaths.identities);
  // The in-use sentence counts agents only once they are known: a
  // skeleton while they load, a usage-unchecked sentence if they fail.
  const {
    agents,
    isSuccess: isAgentsLoaded,
    fetchError: agentsError,
  } = useFetchAgents();
  const usedByCount =
    model != null && isAgentsLoaded
      ? agents.filter((agent) => agent.model.id === model.id).length
      : 0;
  const isUsageLoading =
    model != null && !isAgentsLoaded && agentsError == null;
  const inUse =
    model == null || isUsageLoading
      ? undefined
      : !isAgentsLoaded
        ? t("agentic.model.editUsageUnchecked")
        : usedByCount > 0
          ? t("agentic.model.inUse", { count: usedByCount })
          : undefined;
  const usageSkeleton = (
    <Skeleton width="50%" screenreaderText={t("terms.loading")} />
  );

  // Credentials are Hub identities that hold an API key. The Model's current
  // credential stays selectable even when the Hub no longer lists it.
  const credentialOptions: FilterSelectOptionProps[] = identities
    .filter((identity) => MODEL_CREDENTIAL_KINDS.includes(identity.kind))
    .map(({ id, name }) => ({ value: String(id), label: name }));
  const currentCredential = model?.credential;
  if (
    currentCredential != null &&
    !credentialOptions.some(
      (option) => option.value === String(currentCredential.id)
    )
  ) {
    credentialOptions.unshift({
      value: String(currentCredential.id),
      label: currentCredential.name,
    });
  }
  // A Model read from a backend that does not report its credential (the
  // Gateway references a Secret, see adapters/models.ts) can be edited
  // without choosing one; a new Model needs one.
  const isCredentialRequired = model == null || model.credential != null;
  // Without any API-key credential the next step is to create one. The
  // group renders one helper item and an error would replace it, so the link
  // stays and "A credential is required." is not shown: Create stays disabled.
  const hasNoCredentials = isIdentitiesLoaded && credentialOptions.length === 0;

  // Sorted by name; each option says its type and verification status.
  const providerOptions: FilterSelectOptionProps[] = [...providers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      value: p.id,
      label: p.name,
      optionProps: {
        description: t("agentic.model.providerOptionDescription", {
          type: t(`agentic.provider.types.${p.providerType}`),
          status: t(
            statusPresentation.verification[p.verificationStatus].labelKey
          ),
        }),
      },
    }));

  const onSuccess = () => {
    pushNotification({
      title: model ? t("agentic.model.updated") : t("agentic.model.created"),
      variant: "success",
    });
    onClose();
  };
  const onError = (error: AxiosError) => {
    pushNotification({
      title: t("agentic.model.saveFailed"),
      message: getAxiosErrorMessage(error),
      variant: "danger",
    });
  };

  const { mutate: createModel, isPending: isCreating } =
    useCreateGatewayMutation(onSuccess, onError);
  const { mutate: updateModel, isPending: isUpdating } =
    useUpdateGatewayMutation(onSuccess, onError);
  const isSaving = isCreating || isUpdating;

  const validationSchema = object().shape({
    name: string()
      .trim()
      .required(t("agentic.model.validation.nameRequired"))
      .max(120, t("agentic.model.validation.nameLength"))
      .test(
        "Duplicate name",
        t("agentic.model.validation.nameDuplicate"),
        (value) =>
          duplicateNameCheck(gateways || [], model || null, value || "")
      ),
    description: string().trim().max(500),
    providerId: string()
      .trim()
      .required(t("agentic.model.validation.providerRequired")),
    model: string()
      .trim()
      .required(t("agentic.model.validation.modelRequired")),
    credentialId: isCredentialRequired
      ? string()
          .trim()
          .required(t("agentic.model.validation.credentialRequired"))
      : string().trim(),
  });

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { isDirty, isSubmitting, isValid, isValidating },
  } = useForm<FormValues>({
    defaultValues: {
      name: model?.name || "",
      description: model?.description || "",
      providerId: model?.provider.id ?? "",
      model: model?.model || "",
      credentialId: model?.credential ? String(model.credential.id) : "",
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const selectedProviderId = useWatch({ control, name: "providerId" });
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  const { availableModels } = useFetchAvailableModels(
    selectedProviderId || undefined
  );
  const modelOptions: FilterSelectOptionProps[] = availableModels.map((m) => ({
    value: m.id,
    label: t("agentic.model.modelIdOption", { name: m.displayName, id: m.id }),
  }));
  // Keep the saved Model ID selectable even when the provider no longer lists it.
  const currentModelId = useWatch({ control, name: "model" });
  if (
    currentModelId !== "" &&
    !modelOptions.some((option) => option.value === currentModelId)
  ) {
    modelOptions.unshift({ value: currentModelId, label: currentModelId });
  }

  /** A Model ID only makes sense for its provider: clear it when the user picks another one. */
  const onProviderChange = (providerId: string) => {
    if (providerId !== getValues("providerId")) {
      setValue("model", "", { shouldDirty: true, shouldValidate: true });
    }
  };

  const onSubmit = (values: FormValues) => {
    const provider = providers.find((p) => p.id === values.providerId);
    const credentialId = Number(values.credentialId);
    const payload: ModelRequest = {
      name: values.name.trim(),
      description: values.description.trim(),
      provider: { id: values.providerId },
      model: values.model.trim(),
      endpoint: provider?.endpoint || undefined,
      credential:
        values.credentialId !== "" && Number.isFinite(credentialId)
          ? { id: credentialId }
          : undefined,
    };

    if (model) updateModel({ id: model.id, ...payload });
    else createModel(payload);
  };

  const statusAlert =
    model != null && model.verificationStatus !== "verified" ? (
      <Alert
        isInline
        isPlain
        variant={model.verificationStatus === "unreachable" ? "danger" : "info"}
        title={
          model.verificationStatus === "unreachable"
            ? t("agentic.model.unreachableTitle")
            : t("agentic.model.pendingTitle")
        }
      >
        <Content>
          <Content component="p">
            {[model.statusReason, t("agentic.model.statusAlertAction")]
              .filter(Boolean)
              .join(" ")}
          </Content>
          {isUsageLoading
            ? usageSkeleton
            : inUse != null && <Content component="p">{inUse}</Content>}
        </Content>
      </Alert>
    ) : isUsageLoading ? (
      usageSkeleton
    ) : inUse != null ? (
      <Alert isInline isPlain variant="warning" title={inUse} />
    ) : null;

  const form = (
    <Form id="model-form" onSubmit={handleSubmit(onSubmit)}>
      <HookFormPFTextInput
        control={control}
        name="name"
        label={t("terms.name")}
        fieldId="model-name"
        isRequired
      />
      <HookFormPFTextArea
        control={control}
        name="description"
        label={t("terms.description")}
        fieldId="model-description"
      />
      <HookFormPFGroupController
        control={control}
        name="providerId"
        label={t("agentic.model.provider")}
        fieldId="model-provider"
        isRequired
        helperText={
          selectedProvider
            ? t("agentic.model.providerEndpoint", {
                endpoint: selectedProvider.endpoint,
              })
            : t("agentic.model.providerHelp")
        }
        renderInput={({ field: { value, name, onChange } }) => (
          <TypeaheadSelect
            toggleId="model-provider-select"
            toggleAriaLabel={t("agentic.model.providerSelect")}
            ariaLabel={name}
            value={value}
            options={providerOptions}
            onSelect={(selection) => {
              onProviderChange(selection ?? "");
              onChange(selection ?? "");
            }}
            placeholderText={t("agentic.model.providerPlaceholder")}
          />
        )}
      />
      <HookFormPFGroupController
        control={control}
        name="model"
        label={t("agentic.model.modelId")}
        fieldId="model-id"
        isRequired
        helperText={
          selectedProvider
            ? t("agentic.model.modelOffered", {
                provider: selectedProvider.name,
              })
            : t("agentic.model.modelHelp")
        }
        renderInput={({ field: { value, name, onChange } }) => (
          <TypeaheadSelect
            toggleId="model-id-select"
            toggleAriaLabel={t("agentic.model.modelSelect")}
            ariaLabel={name}
            value={value}
            options={modelOptions}
            onSelect={(selection) => onChange(selection ?? "")}
            placeholderText={t("agentic.model.modelPlaceholder")}
            isDisabled={!selectedProvider}
          />
        )}
      />
      <HookFormPFGroupController
        control={control}
        name="credentialId"
        label={t("agentic.model.credential")}
        fieldId="model-credential"
        errorsSuppressed={hasNoCredentials}
        helperText={
          hasNoCredentials ? (
            <>
              {t("agentic.model.credentialHelp")}{" "}
              <Button variant="link" isInline component={credentialsLink}>
                {t("agentic.model.credentialNone")}
              </Button>
            </>
          ) : (
            t("agentic.model.credentialHelp")
          )
        }
        isRequired={isCredentialRequired}
        renderInput={({ field: { value, name, onChange } }) => (
          <TypeaheadSelect
            toggleId="model-credential-select"
            toggleAriaLabel={t("agentic.model.credentialSelect")}
            ariaLabel={name}
            value={value}
            options={credentialOptions}
            onSelect={(selection) => onChange(selection ?? "")}
            placeholderText={t("agentic.model.credentialPlaceholder")}
          />
        )}
      />
    </Form>
  );

  return (
    <>
      <ModalHeader
        labelId={MODEL_FORM_TITLE_ID}
        descriptorId={MODEL_FORM_DESCRIPTION_ID}
        title={model ? t("agentic.model.edit") : t("agentic.model.create")}
        description={
          model
            ? t("agentic.model.editDescription")
            : t("agentic.model.createDescription")
        }
      />
      <ModalBody>
        {statusAlert ? (
          <Stack hasGutter>
            {statusAlert}
            {form}
          </Stack>
        ) : (
          form
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form="model-form"
          variant={ButtonVariant.primary}
          isDisabled={
            !isDirty || !isValid || isSubmitting || isValidating || isSaving
          }
        >
          {model ? t("actions.save") : t("actions.create")}
        </Button>
        <Button variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
