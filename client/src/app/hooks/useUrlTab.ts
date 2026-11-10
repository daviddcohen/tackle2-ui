import { useHistory, useLocation } from "react-router-dom";

/**
 * The active tab of a detail page, kept in the `tab` URL parameter. An unknown
 * or unavailable value falls back to `fallback`, so a bad link never renders a
 * page without a selected tab.
 *
 * The setter takes a PatternFly `Tabs` `onSelect` key as is and ignores keys
 * that are not in `tabs`.
 */
export const useUrlTab = <T extends string>(
  tabs: readonly T[],
  fallback: T
): [T, (key: string | number) => void] => {
  const history = useHistory();
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("tab");
  const activeTab = tabs.find((tab) => tab === requested) ?? fallback;
  const setActiveTab = (key: string | number) => {
    const tab = tabs.find((candidate) => candidate === key);
    if (tab == null) {
      return;
    }
    const next = new URLSearchParams(location.search);
    next.set("tab", tab);
    history.replace({ ...location, search: next.toString() });
  };
  return [activeTab, setActiveTab];
};

/** Id of the panel a URL tab controls (`Tab tabContentId` / `TabContent id`). */
export const tabPanelId = (page: string, tab: string) =>
  `${page}-tab-panel-${tab}`;
