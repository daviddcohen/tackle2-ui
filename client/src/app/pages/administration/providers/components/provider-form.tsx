import * as React from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AxiosError } from "axios";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { mixed, object, string } from "yup";
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
  useFetchGateways,
  useFetchProviders,
  useUpdateProviderMutation,
} from "@app/queries/agentic";
import {
  duplicateNameCheck,
  formatDate,
  getAxiosErrorMessage,
  isValidStandardUrl,
} from "@app/utils/utils";

/** Ids of the form's modal title and description, for the Modal that hosts the form. */
export const PROVIDER_FORM_TITLE_ID = "provider-form-title";
export const PROVIDER_FORM_DESCRIPTION_ID = "provider-form-description";

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
  // The in-use sentence counts models only once they are known: a
  // skeleton while they load, a usage-unchecked sentence if they fail.
  const {
    gateways: models,
    isSuccess: isModelsLoaded,
    fetchError: modelsError,
  } = useFetchGateways();
  const usedByCount =
    provider != null && isModelsLoaded
      ? models.filter((model) => model.provider.id === provider.id).length
      : 0;
  const isUsageLoading =
    provider != null && !isModelsLoaded && modelsError == null;

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

  // One alert carries the status and the in-use consequence.
  const inUse =
    provider == null || isUsageLoading
      ? undefined
      : !isModelsLoaded
        ? t("agentic.provider.editUsageUnchecked")
        : usedByCount > 0
          ? t("agentic.provider.inUse", { count: usedByCount })
          : undefined;
  const usageSkeleton = (
    <Skeleton width="50%" screenreaderText={t("terms.loading")} />
  );
  const statusAlert =
    provider != null && provider.verificationStatus !== "verified" ? (
      <Alert
        isInline
        isPlain
        variant={
          provider.verificationStatus === "unreachable" ? "danger" : "info"
        }
        title={
          provider.verificationStatus === "unreachable"
            ? t("agentic.provider.unreachableTitle")
            : t("agentic.provider.pendingTitle")
        }
      >
        <Content>
          <Content component="p">
            {[provider.statusReason, t("agentic.provider.statusAlertAction")]
              .filter(Boolean)
              .join(" ")}
          </Content>
          {(provider.lastVerified != null || inUse != null) && (
            <Content component="p">
              {[
                provider.lastVerified != null
                  ? t("agentic.provider.lastVerified", {
                      date: formatDate(new Date(provider.lastVerified)),
                    })
                  : undefined,
                inUse,
              ]
                .filter(Boolean)
                .join(" ")}
            </Content>
          )}
          {isUsageLoading && usageSkeleton}
        </Content>
      </Alert>
    ) : isUsageLoading ? (
      usageSkeleton
    ) : inUse != null ? (
      <Alert isInline isPlain variant="warning" title={inUse} />
    ) : null;

  const form = (
    <Form id="provider-form" onSubmit={handleSubmit(onSubmit)}>
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
        helperText={t("agentic.provider.endpointHelp")}
        isRequired
      />
    </Form>
  );

  return (
    <>
      <ModalHeader
        labelId={PROVIDER_FORM_TITLE_ID}
        descriptorId={PROVIDER_FORM_DESCRIPTION_ID}
        title={
          provider ? t("agentic.provider.edit") : t("agentic.provider.create")
        }
        description={
          !provider
            ? t("agentic.provider.createDescription")
            : provider.verificationStatus === "verified"
              ? t("agentic.provider.editVerifiedDescription")
              : // the status alert already says to save to verify it again
                t("agentic.provider.editDescription")
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
          form="provider-form"
          variant={ButtonVariant.primary}
          isDisabled={
            !isDirty || !isValid || isSubmitting || isValidating || isSaving
          }
        >
          {provider ? t("actions.save") : t("actions.create")}
        </Button>
        <Button variant={ButtonVariant.link} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
      </ModalFooter>
    </>
  );
};
