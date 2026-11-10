import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  MenuToggle,
  MenuToggleElement,
  PageSection,
  TabContent,
} from "@patternfly/react-core";
import { SearchIcon } from "@patternfly/react-icons";

import {
  BreadCrumbPath,
  BreadCrumbPathProps,
} from "@app/components/BreadCrumbPath";
import { StateError } from "@app/components/StateError";
import { tabPanelId } from "@app/hooks/useUrlTab";

/**
 * Shared pieces of the configuration-plane detail pages (Agent, Skill, Skill
 * collection): the page shown when the entity cannot be displayed, the header
 * "Actions" menu with the same scope and in-use rules as the list pages, and
 * URL-backed tabs.
 */

export interface DetailTabPanelProps {
  prefix: string;
  eventKey: string;
  activeKey: string;
  children: React.ReactNode;
}

/**
 * Tab panel rendered outside `<Tabs>` (so it can live in its own PageSection).
 * Only the active panel renders its content. Pair it with `<Tab id={tabPanelId(...)} tabContentId={tabPanelId(...)}>`:
 * every tab's `aria-controls` then points at a panel that exists.
 */
export const DetailTabPanel: React.FC<DetailTabPanelProps> = ({
  prefix,
  eventKey,
  activeKey,
  children,
}) => {
  const id = tabPanelId(prefix, eventKey);
  const isActive = eventKey === activeKey;
  return (
    <TabContent
      id={id}
      eventKey={eventKey}
      aria-labelledby={`pf-tab-${eventKey}-${id}`}
      hidden={!isActive}
    >
      {/* Inactive panels stay in the DOM (empty) so aria-controls resolves;
          TabContent renders nothing at all without children. */}
      {isActive ? children : <React.Fragment />}
    </TabContent>
  );
};

export interface EntityDetailUnavailableProps {
  breadcrumbs: BreadCrumbPathProps["breadcrumbs"];
  /** The API answered 404 (or the id can never exist). Otherwise the fetch failed. */
  isNotFound: boolean;
  notFoundTitle: string;
  notFoundBody: string;
  backLabel: string;
  backPath: string;
}

/** Not found (404 or unusable id) vs API failure (5xx, network). */
export const EntityDetailUnavailable: React.FC<
  EntityDetailUnavailableProps
> = ({
  breadcrumbs,
  isNotFound,
  notFoundTitle,
  notFoundBody,
  backLabel,
  backPath,
}) => {
  const history = useHistory();
  return (
    <PageSection hasBodyWrapper={false}>
      <BreadCrumbPath breadcrumbs={breadcrumbs} />
      {isNotFound ? (
        <EmptyState
          headingLevel="h1"
          icon={SearchIcon}
          titleText={notFoundTitle}
        >
          <EmptyStateBody>{notFoundBody}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => history.push(backPath)}>
                {backLabel}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : (
        <StateError />
      )}
    </PageSection>
  );
};

export interface EntityDetailActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  /** When set, Delete stays visible but is aria-disabled with this tooltip. */
  deleteDisabledReason?: string;
}

/**
 * Header "Actions" menu (Edit, Delete). Render it only for users with the
 * entity's write scopes, the same check the list page uses for its row actions.
 */
export const EntityDetailActions: React.FC<EntityDetailActionsProps> = ({
  onEdit,
  onDelete,
  deleteDisabledReason,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const isDeleteDisabled = deleteDisabledReason != null;

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={() => setIsOpen(false)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="secondary"
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
        >
          {t("agentic.applicationDetail.actions")}
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem key="edit" onClick={onEdit}>
          {t("actions.edit")}
        </DropdownItem>
        <DropdownItem
          key="delete"
          isDanger
          isAriaDisabled={isDeleteDisabled}
          tooltipProps={
            isDeleteDisabled ? { content: deleteDisabledReason } : undefined
          }
          onClick={onDelete}
        >
          {t("actions.delete")}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};
