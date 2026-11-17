import { BrowserRouter as Router } from "react-router-dom";

import { fireEvent, render, screen } from "@app/test-config/test-utils";

import { NotificationsProvider } from "../../../components/NotificationsContext";
import { DefaultLayout } from "../DefaultLayout";

it.skip("Test snapshot", () => {
  const wrapper = render(
    <Router>
      <NotificationsProvider>
        <DefaultLayout />
      </NotificationsProvider>
    </Router>
  );
  expect(wrapper).toMatchSnapshot();
});

it("moves focus to the main content from the skip link without navigating", () => {
  render(
    <Router>
      <NotificationsProvider>
        <DefaultLayout />
      </NotificationsProvider>
    </Router>
  );
  const skipLink = screen.getByText("Skip to content").closest("a");
  expect(skipLink).toHaveAttribute(
    "href",
    "#main-content-page-layout-horizontal-nav"
  );
  const notPrevented = fireEvent.click(skipLink!);
  expect(notPrevented).toBe(false);
  expect(document.activeElement).toBe(
    document.getElementById("main-content-page-layout-horizontal-nav")
  );
});
