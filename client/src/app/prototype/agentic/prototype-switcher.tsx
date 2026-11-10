/*
 * PROTOTYPE ONLY. This global bar controls stakeholder demonstration state.
 * Production authorization and data must use Hub scopes, RBAC, and APIs.
 *
 * Removal checklist (when shipping to production):
 *   1. Delete client/src/app/layout/PrototypeShell/ and its import in
 *      client/src/index.tsx.
 *   2. Delete the client/src/app/prototype/ folder.
 *   3. Remove <PrototypeAnnotation> call sites and
 *      client/src/app/components/PrototypeAnnotation.tsx.
 *   4. Replace the MSW handlers in client/src/mocks/stub-new-work/agentic/
 *      (they read the scenario via the mock's prototype-state module) with
 *      the real API integration.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import {
  STAGE_EXECUTION_SCENARIOS,
  useAgenticPrototype,
} from "./prototype-state";
import { PrototypePersona, PrototypeScenario } from "./types";

import "./prototype-switcher.css";

/** Returns true when the current URL is a plan run detail page. */
const useIsOnPlanRunDetail = () => {
  const location = useLocation();
  return /\/plan-runs\/[^/]+/.test(location.pathname);
};

export const PrototypeScopeSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const state = useAgenticPrototype();
  const isOnPlanRunDetail = useIsOnPlanRunDetail();

  const isExecutionScenario = (
    STAGE_EXECUTION_SCENARIOS as readonly PrototypeScenario[]
  ).includes(state.scenario);
  const showStageControl = isOnPlanRunDetail && isExecutionScenario;

  const scenarioDescription = t(
    `agentic.prototype.scenarioDescriptions.${state.scenario}`,
    { defaultValue: "" }
  );

  return (
    <div
      className="prototype-scope-switcher"
      role="region"
      aria-label={t("agentic.prototype.scopeAriaLabel")}
      data-prototype-slot
    >
      <span className="prototype-scope-switcher__label">
        {t("agentic.prototype.prototypeOnly")}
      </span>

      <label htmlFor="prototype-persona">
        {t("agentic.prototype.persona")}
      </label>
      <select
        id="prototype-persona"
        value={state.persona}
        onChange={(event) =>
          state.setPersona(event.target.value as PrototypePersona)
        }
        aria-label={t("agentic.prototype.persona")}
      >
        <option value="platformEngineer">
          {t("agentic.prototype.personas.platformEngineer")}
        </option>
        <option value="enterpriseArchitect">
          {t("agentic.prototype.personas.enterpriseArchitect")}
        </option>
        <option value="hubMigrator">
          {t("agentic.prototype.personas.hubMigrator")}
        </option>
      </select>

      <label htmlFor="prototype-scenario">
        {t("agentic.prototype.scenario")}
      </label>
      <select
        id="prototype-scenario"
        value={state.scenario}
        onChange={(event) =>
          state.setScenario(event.target.value as PrototypeScenario)
        }
        aria-label={t("agentic.prototype.scenario")}
      >
        {state.scenarioOptions.map((scenario) => (
          <option key={scenario} value={scenario}>
            {t(`agentic.prototype.scenarios.${scenario}`)}
          </option>
        ))}
      </select>

      {showStageControl && (
        <>
          <label htmlFor="prototype-stage">
            {t("agentic.prototype.stage")}
          </label>
          <select
            id="prototype-stage"
            value={state.stageIndex}
            onChange={(event) =>
              state.setStageIndex(Number(event.target.value))
            }
            aria-label={t("agentic.prototype.stage")}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </>
      )}

      {scenarioDescription && (
        <span
          className="prototype-scope-switcher__scenario-desc"
          aria-live="polite"
        >
          {scenarioDescription}
        </span>
      )}

      <button type="button" onClick={state.reset}>
        {t("agentic.prototype.reset")}
      </button>
    </div>
  );
};
