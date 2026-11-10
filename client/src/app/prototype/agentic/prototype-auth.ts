/*
 * PROTOTYPE ONLY. This adapter keeps URL-backed persona state aligned with the
 * development masquerade strategy before protected routes render.
 */
import {
  MasqueradePreset,
  setCurrentPreset,
} from "@app/auth/masquerade/masquerade";

import { PrototypePersona } from "./types";

export const getPrototypeMasqueradePreset = (
  persona: PrototypePersona
): MasqueradePreset =>
  persona === "platformEngineer"
    ? "admin"
    : persona === "enterpriseArchitect"
      ? "architect"
      : "migrator";

const isPrototypePersona = (value: string | null): value is PrototypePersona =>
  value === "platformEngineer" ||
  value === "enterpriseArchitect" ||
  value === "hubMigrator";

export const initializePrototypeMasquerade = () => {
  const params = new URLSearchParams(window.location.search);
  const persona = params.get("protoPersona");
  if (isPrototypePersona(persona)) {
    setCurrentPreset(getPrototypeMasqueradePreset(persona));
  }
};
