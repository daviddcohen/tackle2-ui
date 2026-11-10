import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPath, parsePath } from "history";
import { useHistory, useLocation } from "react-router-dom";

import { AdminPaths, DevPaths } from "@app/Paths";
import { useMasqueradeDispatch } from "@app/auth/masquerade/MasqueradeAuthStrategy";
import {
  BreadcrumbState,
  useIncomingBreadcrumbs,
} from "@app/hooks/useBreadcrumbs";

import { getPrototypeMasqueradePreset } from "./prototype-auth";
import {
  PROTOTYPE_FIXTURE_RESET_EVENT,
  PrototypePersona,
  PrototypeScenario,
  PrototypeState,
} from "./types";

const PERSONAS: PrototypePersona[] = [
  "platformEngineer",
  "enterpriseArchitect",
  "hubMigrator",
];
const SCENARIOS: PrototypeScenario[] = [
  "initial",
  "partialConfiguration",
  "configured",
  "preflightBlocked",
  "queued",
  "running",
  "actionRequired",
  "failed",
  "completed",
  "loading",
  "apiError",
];

/** Scenarios where the stage index control is meaningful. */
export const STAGE_EXECUTION_SCENARIOS: PrototypeScenario[] = [
  "running",
  "actionRequired",
  "failed",
];

const defaults: PrototypeState = {
  persona: "enterpriseArchitect",
  scenario: "configured",
  stageIndex: 1,
};

const scenarioOptions: Record<PrototypePersona, PrototypeScenario[]> = {
  platformEngineer: [
    "initial",
    "partialConfiguration",
    "configured",
    "failed",
    "loading",
    "apiError",
  ],
  enterpriseArchitect: SCENARIOS,
  hubMigrator: [
    "configured",
    "running",
    "actionRequired",
    "failed",
    "completed",
  ],
};

const getStartingPath = (state: PrototypeState) => {
  if (state.persona === "platformEngineer") return AdminPaths.models;
  return DevPaths.applications;
};

export interface PrototypeStateContextValue extends PrototypeState {
  scenarioOptions: PrototypeScenario[];
  setPersona: (persona: PrototypePersona) => void;
  setScenario: (scenario: PrototypeScenario) => void;
  setStageIndex: (index: number) => void;
  reset: () => void;
}

const PrototypeStateContext = createContext<
  PrototypeStateContextValue | undefined
>(undefined);

const isOneOf = <T extends string>(
  value: string | null,
  values: T[]
): value is T => value != null && values.includes(value as T);

export const AgenticPrototypeProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const history = useHistory();
  const location = useLocation<BreadcrumbState>();
  const incomingBreadcrumbs = useIncomingBreadcrumbs();
  const queryClient = useQueryClient();
  const switchMasquerade = useMasqueradeDispatch();
  const lastStateRef = useRef<PrototypeState>(defaults);
  const lastFixtureStateRef = useRef({
    scenario: defaults.scenario,
    stageIndex: defaults.stageIndex,
  });

  const state = useMemo<PrototypeState>(() => {
    const params = new URLSearchParams(location.search);
    const previousState = lastStateRef.current;
    const personaValue = params.get("protoPersona");
    const persona = isOneOf(personaValue, PERSONAS)
      ? personaValue
      : previousState.persona;
    const allowedScenarios = scenarioOptions[persona];
    const scenarioValue = params.get("protoScenario");
    const scenario =
      isOneOf(scenarioValue, SCENARIOS) &&
      allowedScenarios.includes(scenarioValue)
        ? scenarioValue
        : allowedScenarios.includes(previousState.scenario)
          ? previousState.scenario
          : allowedScenarios[0];
    const rawStage = parseInt(params.get("protoStage") ?? "", 10);
    const stageIndex =
      Number.isFinite(rawStage) && rawStage >= 1
        ? rawStage
        : previousState.stageIndex;
    return { persona, scenario, stageIndex };
  }, [location.search]);

  useEffect(() => {
    lastStateRef.current = state;
    const params = new URLSearchParams(location.search);
    params.set("protoPersona", state.persona);
    params.set("protoScenario", state.scenario);
    params.set("protoStage", String(state.stageIndex));
    const canonicalSearch = params.toString();
    if (canonicalSearch !== location.search.replace(/^\?/, "")) {
      // MSW handlers read protoScenario/protoStage from the URL and fall back
      // to the last values they saw when a link drops them, so only refetch
      // when the URL carried a different explicit scenario or stage.
      const seen = new URLSearchParams(location.search);
      const seenScenario = seen.get("protoScenario");
      const seenStage = seen.get("protoStage");
      const handlersSawDifferentFixture =
        (seenScenario != null && seenScenario !== state.scenario) ||
        (seenStage != null && seenStage !== String(state.stageIndex));
      history.replace({
        ...location,
        pathname: location.pathname,
        search: canonicalSearch,
      });
      if (handlersSawDifferentFixture) {
        queryClient.invalidateQueries();
      }
    }
  }, [history, location, queryClient, state]);

  const writeState = useCallback(
    (
      next: PrototypeState,
      pathname = location.pathname,
      resetNavigation = false
    ) => {
      lastStateRef.current = next;
      window.dispatchEvent(new Event(PROTOTYPE_FIXTURE_RESET_EVENT));
      queryClient.invalidateQueries();
      const params = new URLSearchParams(
        resetNavigation ? "" : location.search
      );
      params.set("protoPersona", next.persona);
      params.set("protoScenario", next.scenario);
      params.set("protoStage", String(next.stageIndex));
      // Explicit scenario changes apply to the entire demo, including saved return views.
      const navigationState = {
        ...location.state,
        breadcrumbs: incomingBreadcrumbs?.map((entry) => {
          if (entry.path == null) return entry;
          const savedLocation = parsePath(entry.path);
          const savedParams = new URLSearchParams(savedLocation.search);
          savedParams.set("protoPersona", next.persona);
          savedParams.set("protoScenario", next.scenario);
          savedParams.set("protoStage", String(next.stageIndex));
          return {
            ...entry,
            path: createPath({
              ...savedLocation,
              search: savedParams.toString(),
            }),
          };
        }),
      };
      history.push({
        pathname,
        search: params.toString(),
        hash:
          !resetNavigation && pathname === location.pathname
            ? location.hash
            : "",
        state:
          !resetNavigation && pathname === location.pathname
            ? navigationState
            : undefined,
      });
    },
    [history, incomingBreadcrumbs, location, queryClient]
  );

  useLayoutEffect(() => {
    switchMasquerade(getPrototypeMasqueradePreset(state.persona));
  }, [state.persona, switchMasquerade]);

  useEffect(() => {
    const previous = lastFixtureStateRef.current;
    if (
      previous.scenario !== state.scenario ||
      previous.stageIndex !== state.stageIndex
    ) {
      queryClient.invalidateQueries();
      lastFixtureStateRef.current = {
        scenario: state.scenario,
        stageIndex: state.stageIndex,
      };
    }
  }, [queryClient, state.stageIndex, state.scenario]);

  const setPersona = useCallback(
    (persona: PrototypePersona) => {
      const allowedScenarios = scenarioOptions[persona];
      const next: PrototypeState = {
        persona,
        scenario: allowedScenarios.includes(state.scenario)
          ? state.scenario
          : allowedScenarios[0],
        stageIndex: 1,
      };
      switchMasquerade(getPrototypeMasqueradePreset(persona));
      writeState(next, getStartingPath(next), true);
    },
    [state, switchMasquerade, writeState]
  );

  const value = useMemo<PrototypeStateContextValue>(
    () => ({
      ...state,
      scenarioOptions: scenarioOptions[state.persona],
      setPersona,
      setScenario: (scenario) => writeState({ ...state, scenario }),
      setStageIndex: (stageIndex) =>
        writeState({ ...state, stageIndex: Math.max(1, stageIndex) }),
      reset: () => writeState(defaults, getStartingPath(defaults), true),
    }),
    [setPersona, state, writeState]
  );

  return (
    <PrototypeStateContext.Provider value={value}>
      {children}
    </PrototypeStateContext.Provider>
  );
};

export const useAgenticPrototype = () => {
  const value = useContext(PrototypeStateContext);
  if (!value) {
    throw new Error(
      "useAgenticPrototype must be used within AgenticPrototypeProvider."
    );
  }
  return value;
};
