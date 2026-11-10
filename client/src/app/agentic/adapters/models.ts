/**
 * Model (domain) <-> Gateway (konveyor.io/v1alpha1, `/hub/agentic/gateways`).
 */
import type * as Crd from "@app/api/agentic/contract";
import { readyCondition } from "@app/utils/skills";

import { ModelProjection, ModelRequest, VerificationStatus } from "../types";

import { toEntityId, toEntityRef } from "./common";

type GatewaySpec = Crd.Gateway["spec"];

/** Ready reason the controller sets while its verification Job runs. */
const VERIFYING_REASON = "Verifying";

/**
 * Connection state from the Gateway status:
 * - no Ready condition yet, Ready=False/Verifying, or a Ready condition older
 *   than the current spec (`observedGeneration` < `metadata.generation`,
 *   right after an update): `pending`;
 * - Ready=True: `verified`. This includes reason `VerificationSkipped`
 *   (providers with no probe-able `/v1/models`), where the Gateway is usable
 *   but `connectionVerified` is false; `statusReason` carries the message;
 * - Ready=False for any other reason (`ConnectionFailed`,
 *   `AuthenticationFailed`, `EndpointUnreachable`, credential Secret errors):
 *   `unreachable`.
 */
export const toVerificationStatus = (
  gateway: Crd.Gateway
): VerificationStatus => {
  const ready = readyCondition(gateway.status?.conditions);
  if (ready == null || ready.status === "Unknown") return "pending";
  const { generation } = gateway.metadata;
  if (
    generation != null &&
    ready.observedGeneration != null &&
    ready.observedGeneration < generation
  ) {
    return "pending";
  }
  if (ready.status === "True") return "verified";
  return ready.reason === VERIFYING_REASON ? "pending" : "unreachable";
};

/**
 * Gateway -> Model. No backend source (documented defaults):
 * `description` undefined, `credential` undefined (the CRD references a k8s
 * Secret, not a Hub identity), `isOrganizationDefault` false. `provider` is a
 * ref whose id and name are the runtime provider id (`spec.provider`), since
 * there is no Provider resource.
 */
export const toModel = (gateway: Crd.Gateway): ModelProjection => {
  const ready = readyCondition(gateway.status?.conditions);
  const verificationStatus = toVerificationStatus(gateway);
  return {
    id: toEntityId(gateway.metadata),
    name: toEntityId(gateway.metadata),
    description: undefined,
    provider: toEntityRef(gateway.spec.provider),
    model: gateway.spec.model.name,
    endpoint: gateway.spec.endpoint,
    credential: undefined,
    verificationStatus,
    lastVerified:
      verificationStatus === "pending" ? undefined : ready?.lastTransitionTime,
    statusReason: ready?.message,
    isOrganizationDefault: false,
  };
};

/**
 * What a Gateway spec needs that a `ModelRequest` cannot supply: the
 * credential Secret and the model's context window (both required by the CRD).
 * On update pass the current `gateway.spec`: the Hub replaces the whole spec,
 * so every field of `base` the request does not set (including fields this
 * contract does not know yet) is written back unchanged.
 */
export type GatewaySpecBase = Pick<GatewaySpec, "credentialRef"> &
  Partial<Omit<GatewaySpec, "credentialRef" | "model">> & {
    model: Omit<Crd.GatewayModel, "name"> & { name?: string };
  };

/**
 * ModelRequest -> Gateway spec, spread over `base`. `request.provider.id` is
 * written as the runtime provider id and `request.model` as `model.name`.
 * `name` (the resource name, immutable: see `assertNotRenamed`) is set by the
 * caller; `description` and `credential` (a Hub identity) have no CRD field
 * and are dropped. Throws when neither the request nor `base` has an endpoint
 * (the CRD requires one).
 */
export const toGatewaySpec = (
  request: ModelRequest,
  base: GatewaySpecBase
): GatewaySpec => {
  const endpoint = request.endpoint?.trim() || base.endpoint;
  if (endpoint == null || endpoint === "") {
    throw new Error("A Gateway requires an endpoint.");
  }
  return {
    ...base,
    provider: request.provider.id,
    endpoint,
    model: { ...base.model, name: request.model },
  };
};
