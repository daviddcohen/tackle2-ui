/*
 * PROTOTYPE ONLY. Mounts the agentic prototype state provider and its
 * persona / scenario switcher around the app.
 *
 * index.tsx imports this module only in development bundles and only when
 * `isPrototypeEnabled`, then hands the shell to <App>, so production builds
 * never bundle or run it. Deleting the prototype means deleting this folder
 * and its import in index.tsx.
 */
import * as React from "react";

import { PrototypeAnnotationContext } from "@app/components/PrototypeAnnotation";
import {
  AgenticPrototypeProvider,
  PrototypeScopeSwitcher,
} from "@app/prototype/agentic";

export { initializePrototypeMasquerade } from "@app/prototype/agentic";

export const PrototypeShell: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <AgenticPrototypeProvider>
    <PrototypeAnnotationContext.Provider value>
      <PrototypeScopeSwitcher />
      {children}
    </PrototypeAnnotationContext.Provider>
  </AgenticPrototypeProvider>
);
