import * as React from "react";
import { BrowserRouter } from "react-router-dom";

import { AppRoutes } from "./Routes";
import { NotificationsProvider } from "./components/NotificationsContext";
import { TaskManagerProvider } from "./components/task-manager/TaskManagerContext";
import { DefaultLayout } from "./layout";

import "./app.css";

export interface AppProps {
  /**
   * Optional wrapper inside the router, used by index.tsx to mount the
   * agentic prototype controls in development. The app works without it.
   */
  shell?: React.ComponentType<React.PropsWithChildren>;
}

const App: React.FC<AppProps> = ({ shell: Shell = React.Fragment }) => {
  return (
    <BrowserRouter>
      <Shell>
        <NotificationsProvider>
          <TaskManagerProvider>
            <DefaultLayout>
              <AppRoutes />
            </DefaultLayout>
          </TaskManagerProvider>
        </NotificationsProvider>
      </Shell>
    </BrowserRouter>
  );
};

export default App;
