import "@patternfly/react-core/dist/styles/base.css";

import type { ComponentType, PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRoot } from "react-dom/client";

import App from "@app/App";
import { isPrototypeEnabled } from "@app/Constants";
import { AuthProvider } from "@app/auth";

import "@app/dayjs";
import "@app/i18n";
import "@app/yup";
import "@app/code-editor";
import "@app/axios-auth";

const queryClient = new QueryClient();

const renderApp = (shell?: ComponentType<PropsWithChildren>) => {
  const container = document.getElementById("root");
  const root = createRoot(container!);
  root.render(
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <App shell={shell} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  );
};

if (process.env.NODE_ENV === "development") {
  // The agentic prototype controls exist only in development bundles (this
  // inline NODE_ENV check lets the production build drop the chunk) and run
  // only when `isPrototypeEnabled` (see Constants.ts).
  Promise.all([
    import("./mocks/browser"),
    isPrototypeEnabled
      ? import("@app/layout/PrototypeShell/PrototypeShell")
      : undefined,
  ]).then(([browserMocks, prototype]) => {
    // Apply the URL's prototype persona to the masquerade auth strategy
    // before AuthProvider reads it.
    prototype?.initializePrototypeMasquerade();
    if (browserMocks.config.enabled) {
      browserMocks.worker.start({
        onUnhandledRequest: (request, print) => {
          if (request.url.pathname.startsWith("/hub")) {
            print.warning();
          }
        },
      });
    }
    renderApp(prototype?.PrototypeShell);
  });
} else {
  renderApp();
}
