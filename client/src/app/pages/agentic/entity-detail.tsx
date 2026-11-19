import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Button,
  Divider,
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
  Skeleton,
  Stack,
  StackItem,
  TabContent,
} from "@patternfly/react-core";
import { SearchIcon } from "@patternfly/react-icons";
import { css } from "@patternfly/react-styles";
import display from "@patternfly/react-styles/css/utilities/Display/display";
import flex from "@patternfly/react-styles/css/utilities/Flex/flex";

import { AppPlaceholder } from "@app/components/AppPlaceholder";
import {
  BreadCrumbPath,
  BreadCrumbPathProps,
} from "@app/components/BreadCrumbPath";
import { StateError } from "@app/components/StateError";
import { tabPanelId } from "@app/hooks/useUrlTab";
import { disabledActionProps } from "@app/utils/agentic";

/**
 * Shared pieces of the agentic detail and run pages (agent, migration plan,
 * plan run, stage, skill, skill collection): the loading page, the page shown
 * when the entity cannot be displayed, the header "Actions" menu with the
 * same scope and in-use rules as the list pages, and URL-backed tabs.
 */

export interface DetailTabPanelProps {
  prefix: string;
  eventKey: string;
  activeKey: string;
  /**
   * The open panel grows to the bottom of the page, so a `PageSection
   * isFilled` inside it can hold a full height viewer (as on Task details).
   */
  isFilled?: boolean;
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
  isFilled,
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
      // Only while open: the display utility would override `hidden`.
      className={
        isFilled && isActive
          ? css(display.displayFlex, flex.flexDirectionColumn, flex.flexGrow_1)
          : undefined
      }
    >
      {/* Inactive panels stay in the DOM (empty) so aria-controls resolves;
          TabContent renders nothing at all without children. */}
      {isActive ? children : <React.Fragment />}
    </TabContent>
  );
};

export interface EntityDetailLoadingProps {
  /** The trail with the entity noun as its leaf ("Agent"), since the name is not known yet. */
  breadcrumbs: BreadCrumbPathProps["breadcrumbs"];
}

/**
 * Detail or run page while its entity loads: the breadcrumb and a title
 * skeleton keep the page anchored, then the app spinner.
 */
export const EntityDetailLoading: React.FC<EntityDetailLoadingProps> = ({
  breadcrumbs,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <BreadCrumbPath breadcrumbs={breadcrumbs} />
          </StackItem>
          <StackItem>
            <Skeleton
              fontSize="2xl"
              width="30%"
              screenreaderText={t("terms.loading")}
            />
          </StackItem>
        </Stack>
      </PageSection>
      <AppPlaceholder />
    </>
  );
};

export interface EntityDetailUnavailableProps {
  breadcrumbs: BreadCrumbPathProps["breadcrumbs"];
  /**
   * The API answered 404 (`isNotFoundError`) or the id can never exist. Every
   * other failure (5xx, network) is the error branch: the trail and the shared
   * `StateError`, with no retry.
   */
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

export interface EntityDetailAction {
  key: string;
  label: string;
  onClick: () => void;
}

export interface EntityDetailActionsProps {
  /** Entity verbs listed after Edit, for example "Test agent". */
  items?: EntityDetailAction[];
  /** Pass only with the entity's update scope; Edit is omitted without it. */
  onEdit?: () => void;
  /** Pass only with the entity's delete scope; Delete is omitted without it. */
  onDelete?: () => void;
  /** When set (for example in use), Delete stays visible but is aria-disabled with this tooltip. */
  deleteDisabledReason?: string;
  /**
   * Operator-managed entity: Edit and Delete are aria-disabled with this
   * tooltip (`disabledActionProps`); it wins over `deleteDisabledReason`.
   */
  managedReason?: string;
}

/**
 * Header "Actions" menu: Edit, the entity verbs from `items`, a separator and
 * Delete, in the same order as the list row menu. Each entry is
 * shown only when its handler is passed, and the menu renders nothing when no
 * entry remains.
 */
export const EntityDetailActions: React.FC<EntityDetailActionsProps> = ({
  items = [],
  onEdit,
  onDelete,
  deleteDisabledReason,
  managedReason,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  if (onEdit == null && onDelete == null && items.length === 0) {
    return null;
  }

  // A managed entity cannot be deleted at all, so its reason wins over in-use.
  const deleteBlockedReason = managedReason ?? deleteDisabledReason;
  const hasEntryBeforeDelete = onEdit != null || items.length > 0;

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
          {t("agentic.common.actions")}
        </MenuToggle>
      )}
    >
      <DropdownList>
        {onEdit != null && (
          <DropdownItem
            key="edit"
            onClick={onEdit}
            {...disabledActionProps(managedReason)}
          >
            {t("actions.edit")}
          </DropdownItem>
        )}
        {items.map((item) => (
          <DropdownItem key={item.key} onClick={item.onClick}>
            {item.label}
          </DropdownItem>
        ))}
        {onDelete != null && hasEntryBeforeDelete && (
          <Divider component="li" key="separator" />
        )}
        {onDelete != null && (
          <DropdownItem
            key="delete"
            isDanger={deleteBlockedReason == null}
            {...disabledActionProps(deleteBlockedReason)}
            onClick={onDelete}
          >
            {t("actions.delete")}
          </DropdownItem>
        )}
      </DropdownList>
    </Dropdown>
  );
};
