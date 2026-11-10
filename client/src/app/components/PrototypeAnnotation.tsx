import * as React from "react";

/**
 * True only inside the development prototype shell
 * (`layout/PrototypeShell`), which provides it. Everywhere else, including
 * production builds and unit tests, it is false.
 */
export const PrototypeAnnotationContext = React.createContext(false);

/**
 * Review notes for the prototype (for example, which behaviour still needs a
 * Hub endpoint). Renders its children only while the prototype shell is
 * mounted, so product UI never shows them. Deleting the prototype leaves
 * these as no-ops that can be removed with their call sites.
 */
export const PrototypeAnnotation: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const isPrototypeShellActive = React.useContext(PrototypeAnnotationContext);
  return isPrototypeShellActive ? <>{children}</> : null;
};
