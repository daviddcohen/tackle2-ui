import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { object, string } from "yup";
import {
  ActionGroup,
  Alert,
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  Spinner,
} from "@patternfly/react-core";

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
import {
  useCreateGatewayMutation,
  useFetchAvailableModels,
  useFetchGateways,
  useFetchProviders,
  useUpdateGatewayMutation,
} from "@app/queries/agentic";
import { useFetchIdentities } from "@app/queries/identities";
import { duplicateNameCheck, getAxiosErrorMessage } from "@app/utils/utils";

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
  const { providers, isLoading: isLoadingProviders } = useFetchProviders();
  const { identities, isFetching: isLoadingIdentities } = useFetchIdentities();

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

  const providerOptions: FilterSelectOptionProps[] = providers.map((p) => ({
    value: p.id,
    label: t("agentic.model.providerOption", {
      provider: p.name,
      type: t(`agentic.provider.types.${p.providerType}`),
    }),
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

  const { availableModels, isFetching: isFetchingModels } =
    useFetchAvailableModels(selectedProviderId || undefined);
  const modelOptions: FilterSelectOptionProps[] = availableModels.map((m) => ({
    value: m.id,
    label: m.displayName,
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

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
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
        helperText={t("agentic.model.providerHelp")}
        renderInput={({ field: { value, name, onChange } }) =>
          // TypeaheadSelect reads its display text once on mount, so wait for the options.
          isLoadingProviders ? (
            <Spinner size="md" />
          ) : (
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
          )
        }
      />
      {selectedProvider && (
        <Alert
          isInline
          variant="info"
          title={t("agentic.model.providerEndpoint", {
            provider: selectedProvider.name,
            endpoint: selectedProvider.endpoint,
          })}
        />
      )}
      {selectedProvider && (
        <HookFormPFGroupController
          control={control}
          name="model"
          label={t("agentic.model.modelId")}
          fieldId="model-id"
          isRequired
          renderInput={({ field: { value, name, onChange } }) =>
            isFetchingModels ? (
              <FormGroup fieldId="model-id-loading">
                <Spinner size="md" />
              </FormGroup>
            ) : (
              <TypeaheadSelect
                toggleId="model-id-select"
                toggleAriaLabel={t("agentic.model.modelSelect")}
                ariaLabel={name}
                value={value}
                options={modelOptions}
                onSelect={(selection) => onChange(selection ?? "")}
                placeholderText={t("agentic.model.modelPlaceholder")}
              />
            )
          }
        />
      )}
      {!selectedProvider && (
        <HookFormPFTextInput
          control={control}
          name="model"
          label={t("agentic.model.modelId")}
          fieldId="model-id"
          isRequired
          helperText={t("agentic.model.modelHelp")}
        />
      )}
      <HookFormPFGroupController
        control={control}
        name="credentialId"
        label={t("agentic.model.credential")}
        fieldId="model-credential"
        helperText={t("agentic.model.credentialHelp")}
        isRequired={isCredentialRequired}
        renderInput={({ field: { value, name, onChange } }) =>
          isLoadingIdentities ? (
            <Spinner size="md" />
          ) : (
            <TypeaheadSelect
              toggleId="model-credential-select"
              toggleAriaLabel={t("agentic.model.credentialSelect")}
              ariaLabel={name}
              value={value}
              options={credentialOptions}
              onSelect={(selection) => onChange(selection ?? "")}
              placeholderText={t("agentic.model.credentialPlaceholder")}
            />
          )
        }
      />
      <ActionGroup>
        <Button
          type="submit"
          variant={ButtonVariant.primary}
          isDisabled={
            !isDirty || !isValid || isSubmitting || isValidating || isSaving
          }
        >
          {model ? t("actions.save") : t("actions.create")}
        </Button>
        <Button type="button" variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ActionGroup>
    </Form>
  );
};
