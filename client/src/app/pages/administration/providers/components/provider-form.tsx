import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { mixed, object, string } from "yup";
import {
  ActionGroup,
  Button,
  ButtonVariant,
  Form,
} from "@patternfly/react-core";

import { Provider, ProviderRequest, ProviderType } from "@app/agentic";
import SimpleSelect from "@app/components/FilterToolbar/components/SimpleSelect";
import {
  HookFormPFGroupController,
  HookFormPFTextArea,
  HookFormPFTextInput,
} from "@app/components/HookFormPFFields";
import { NotificationsContext } from "@app/components/NotificationsContext";
import {
  useCreateProviderMutation,
  useFetchProviders,
  useUpdateProviderMutation,
} from "@app/queries/agentic";
import {
  duplicateNameCheck,
  getAxiosErrorMessage,
  isValidStandardUrl,
} from "@app/utils/utils";

export const PROVIDER_TYPES: readonly ProviderType[] = [
  "anthropic",
  "azure_openai",
  "vertex",
  "ollama",
  "openai",
  "other",
];

export interface ProviderFormValues {
  name: string;
  description: string;
  providerType: ProviderType;
  endpoint: string;
}

interface ProviderFormProps {
  provider: Provider | null;
  onClose: () => void;
}

export const ProviderForm: React.FC<ProviderFormProps> = ({
  provider,
  onClose,
}) => {
  const { t } = useTranslation();
  const { pushNotification } = React.useContext(NotificationsContext);
  const { providers } = useFetchProviders();

  const onSuccess = () => {
    pushNotification({
      title: provider
        ? t("agentic.provider.updated")
        : t("agentic.provider.created"),
      variant: "success",
    });
    onClose();
  };
  // Keep the modal (and the input) open so the user can correct and retry.
  const onError = (error: AxiosError) => {
    pushNotification({ title: getAxiosErrorMessage(error), variant: "danger" });
  };
  const { mutate: createProvider, isLoading: isCreating } =
    useCreateProviderMutation(onSuccess, onError);
  const { mutate: updateProvider, isLoading: isUpdating } =
    useUpdateProviderMutation(onSuccess, onError);

  const validationSchema = object({
    name: string()
      .trim()
      .required(t("agentic.provider.validation.nameRequired"))
      .max(120, t("agentic.provider.validation.nameMaximum"))
      .test(
        "duplicate-name",
        t("agentic.provider.validation.nameDuplicate"),
        (value) => duplicateNameCheck(providers, provider, value ?? "")
      ),
    description: string()
      .trim()
      .max(500, t("agentic.provider.validation.descriptionMaximum")),
    providerType: mixed<ProviderType>()
      .oneOf([...PROVIDER_TYPES])
      .required(),
    endpoint: string()
      .trim()
      .required(t("agentic.provider.validation.endpointRequired"))
      .max(2048, t("agentic.provider.validation.endpointUrl"))
      .test(
        "url",
        t("agentic.provider.validation.endpointUrl"),
        (value) => value == null || isValidStandardUrl(value.trim())
      ),
  });

  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting, isValid, isValidating },
  } = useForm<ProviderFormValues>({
    defaultValues: {
      name: provider?.name ?? "",
      description: provider?.description ?? "",
      providerType: provider?.providerType ?? "anthropic",
      endpoint: provider?.endpoint ?? "",
    },
    resolver: yupResolver(validationSchema),
    mode: "all",
  });

  const onSubmit = (values: ProviderFormValues) => {
    const request: ProviderRequest = {
      name: values.name.trim(),
      description: values.description.trim(),
      providerType: values.providerType,
      endpoint: values.endpoint.trim(),
      credential: provider?.credential
        ? { id: provider.credential.id }
        : undefined,
    };
    if (provider) updateProvider({ id: provider.id, ...request });
    else createProvider(request);
  };

  const isSaving = isCreating || isUpdating;

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <HookFormPFTextInput
        control={control}
        name="name"
        label={t("terms.name")}
        fieldId="provider-name"
        isRequired
      />
      <HookFormPFTextArea
        control={control}
        name="description"
        label={t("terms.description")}
        fieldId="provider-description"
        rows={3}
        resizeOrientation="vertical"
      />
      <HookFormPFGroupController
        control={control}
        name="providerType"
        label={t("agentic.provider.providerType")}
        fieldId="provider-type"
        isRequired
        renderInput={({ field: { value, onChange } }) => (
          <SimpleSelect
            toggleId="provider-type-select"
            toggleAriaLabel={t("agentic.provider.providerType")}
            value={value}
            options={PROVIDER_TYPES.map((type) => ({
              value: type,
              label: t(`agentic.provider.types.${type}`),
            }))}
            onSelect={(selection) => onChange(selection)}
          />
        )}
      />
      <HookFormPFTextInput
        control={control}
        name="endpoint"
        label={t("agentic.provider.endpoint")}
        fieldId="provider-endpoint"
        type="url"
        placeholder="https://api.example.com/v1"
        isRequired
      />
      <ActionGroup>
        <Button
          type="submit"
          variant={ButtonVariant.primary}
          isDisabled={
            !isDirty || !isValid || isSubmitting || isValidating || isSaving
          }
          isLoading={isSaving}
        >
          {provider ? t("actions.save") : t("agentic.provider.create")}
        </Button>
        <Button type="button" variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ActionGroup>
    </Form>
  );
};
