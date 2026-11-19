import { FC, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Label,
  LabelGroup,
  MenuToggle,
  MenuToggleElement,
  MenuToggleProps,
  PopperOptions,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from "@patternfly/react-core";
import { TimesIcon } from "@patternfly/react-icons";

import { FilterSelectOptionProps } from "../FilterToolbar";

import {
  claimEscapeForOpenMenu,
  getDisplayValue,
  getDisplayValueForChip,
  getStableIndex,
  noResultsId,
  toDisplayValue,
} from "./selectUtils";
import { useFocusHandlers } from "./useFocusHandlers";

export interface MultiSelectProps {
  isScrollable?: boolean;
  options: FilterSelectOptionProps[];
  values?: string[];
  onSelect: (value?: string) => void;
  onClear: () => void;
  placeholderText?: string;
  isDisabled?: boolean;
  isFullWidth?: boolean;

  ariaLabel?: string;
  /**
   * alias for ariaLabel
   * */
  "aria-label"?: string;
  toggleId: string;
  toggleAriaLabel?: string;
  toggleStatus?: MenuToggleProps["status"];
  /**
   * Accessible name of the typeahead input, usually the field label. Without
   * it the input keeps the PatternFly default "Type to filter".
   */
  inputAriaLabel?: string;
  /** Id(s) of the element(s) that describe the input, such as helper text. */
  inputAriaDescribedBy?: string;
  /**
   * Passed to the menu popper, for example `{ width: "trigger" }` to keep the
   * menu as wide as the toggle inside a modal.
   */
  popperProps?: PopperOptions;
  hasCheckbox?: boolean;
  hasBadge?: boolean;
  showSelectedInToggle?: boolean;
  closeMenuOnSelect?: boolean;
  hasChips?: boolean;
  /** Maximum height of the open menu (PF `Select` `maxMenuHeight`), for example "24rem". */
  maxMenuHeight?: string;
  /**
   * Selected values the user cannot remove: their chips have no close button
   * and selecting them again does nothing. `onClear` is still called for the
   * clear button, so callers keep these values when they clear.
   */
  lockedValues?: string[];
}

export const MultiSelect: FC<MultiSelectProps> = ({
  options,
  ariaLabel,
  "aria-label": htmlAriaLabel,
  values,
  placeholderText,
  onSelect: onSelectCallback,
  isDisabled = false,
  isScrollable = true,
  isFullWidth = true,
  toggleId,
  toggleAriaLabel,
  toggleStatus,
  inputAriaLabel,
  inputAriaDescribedBy,
  popperProps,
  hasCheckbox,
  hasBadge,
  showSelectedInToggle,
  closeMenuOnSelect,
  hasChips = false,
  maxMenuHeight,
  lockedValues,
  onClear,
}: MultiSelectProps): JSX.Element | null => {
  const { t } = useTranslation();
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>();

  const selectedDisplayValue = showSelectedInToggle
    ? getDisplayValue(values?.[0] ?? "", options)
    : "";
  // What the user typed; `undefined` while not editing, so a selected value
  // whose options load later still shows its label.
  const [typedValue, setTypedValue] = useState<string>();
  const inputValue =
    typedValue ?? (showSelectedInToggle ? selectedDisplayValue : "");

  // extend "empty" search state: show all options if a value is selected
  const showAllOptions =
    showSelectedInToggle &&
    (!inputValue || inputValue === selectedDisplayValue);

  const filteredOptions = options?.filter(
    (opt) =>
      showAllOptions ||
      [toDisplayValue(opt), opt.groupLabel]
        .filter(Boolean)
        .map((it) => it.toLocaleLowerCase())
        .some((it) => it.includes(inputValue?.trim().toLowerCase() ?? ""))
  );

  const isLocked = (value: string) => lockedValues?.includes(value) ?? false;
  const hasRemovableValue = values?.some((value) => !isLocked(value)) ?? false;

  const onSelect = (value: string | undefined) => {
    if (!value || value === noResultsId(toggleId) || isLocked(value)) {
      return;
    }

    onSelectCallback(value);
    if (showSelectedInToggle) {
      setTypedValue(undefined);
    }
    if (closeMenuOnSelect) {
      closeMenu();
    }
  };

  const closeMenu = () => {
    setIsFilterDropdownOpen(false);
    resetActiveAndFocusedItem();
    textInputRef?.current?.focus();
  };

  const setInputToSelected = () => {
    if (showSelectedInToggle) {
      setTypedValue(undefined);
    }
  };

  const {
    focusedItemIndex,
    focusedItem,
    activeItemId,
    resetActiveAndFocusedItem,
    moveFocusedItemIndex,
  } = useFocusHandlers({
    filteredOptions,
    options,
    idPrefix: toggleId,
  });

  const onInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLDivElement>
  ) => {
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        if (
          isFilterDropdownOpen &&
          focusedItem &&
          !focusedItem.optionProps?.isAriaDisabled
        ) {
          onSelect(focusedItem.value);
        } else if (!isFilterDropdownOpen) {
          setIsFilterDropdownOpen(true);
          moveFocusedItemIndex("ArrowDown");
        }
        break;
      case "ArrowUp":
      case "ArrowDown":
        if (!isFilterDropdownOpen) {
          setIsFilterDropdownOpen(true);
        }
        moveFocusedItemIndex(event.key);
        break;
    }
  };

  const onOpenChangeKeyDown = (
    isOpen: boolean,
    event: React.KeyboardEvent<HTMLInputElement | HTMLDivElement>
  ) => {
    if (!isOpen || !["Tab", "Escape"].includes(event.key)) {
      return;
    }
    if ("Escape" === event.key) {
      // prevent closing the modal(ESC)
      event.preventDefault();
      event.stopPropagation();
    }

    setIsFilterDropdownOpen(false);
    resetActiveAndFocusedItem();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (claimEscapeForOpenMenu(event, isFilterDropdownOpen)) {
      closeMenu();
      setInputToSelected();
    }
  };

  const onClearButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClear();
    setTypedValue(undefined);
    resetActiveAndFocusedItem();
    textInputRef?.current?.focus();
  };

  const onTextInputChange = (
    _event: React.FormEvent<HTMLInputElement>,
    newInputValue: string
  ) => {
    setTypedValue(newInputValue);
    if (!isFilterDropdownOpen) {
      setIsFilterDropdownOpen(true);
    }
    resetActiveAndFocusedItem();

    if (
      showSelectedInToggle &&
      newInputValue?.trim() !== selectedDisplayValue?.trim()
    ) {
      onSelectCallback(undefined);
    }
  };

  const onToggleClick = () => {
    setIsFilterDropdownOpen((isOpen) => !isOpen);
    textInputRef?.current?.focus();
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      ouiaId={toggleId}
      aria-label={toggleAriaLabel}
      variant="typeahead"
      status={toggleStatus}
      onClick={onToggleClick}
      isExpanded={isFilterDropdownOpen}
      isDisabled={isDisabled}
      isFullWidth={isFullWidth}
    >
      <TextInputGroup isPlain isDisabled={isDisabled}>
        <TextInputGroupMain
          value={inputValue}
          onClick={() => {
            setIsFilterDropdownOpen(true);
          }}
          onChange={onTextInputChange}
          onKeyDown={onInputKeyDown}
          onKeyDownCapture={(event) =>
            onOpenChangeKeyDown(isFilterDropdownOpen, event)
          }
          inputId={`${toggleId}-input`}
          {...(inputAriaLabel != null && { "aria-label": inputAriaLabel })}
          inputProps={
            inputAriaDescribedBy == null
              ? undefined
              : { "aria-describedby": inputAriaDescribedBy }
          }
          autoComplete="off"
          innerRef={textInputRef}
          placeholder={placeholderText}
          {...(activeItemId && { "aria-activedescendant": activeItemId })}
          role="combobox"
          isExpanded={isFilterDropdownOpen}
          aria-controls={`${toggleId}-listbox`}
        >
          {hasChips && (
            <LabelGroup
              aria-label="Current selections"
              data-ouia-component-id={`${toggleId}-chip-group`}
            >
              {values?.map((value) => (
                <Label
                  variant="outline"
                  key={value}
                  closeBtnAriaLabel={
                    isLocked(value)
                      ? undefined
                      : t("terms.removeSelection", {
                          name: getDisplayValue(value, options),
                        })
                  }
                  /**
                   * for testing purposes, we cannot rely on text inside the chip as
                   * it can be truncated
                   * ouiaId is not used as it is used 2x in the chip:
                   * outer div and button
                   * aria-label is not used at the chip level
                   * as a workaround, we use a span with the aria-label
                   */
                  onClose={
                    isLocked(value)
                      ? undefined
                      : (ev) => {
                          ev.stopPropagation();
                          onSelect(value);
                        }
                  }
                >
                  <span aria-label={getDisplayValue(value, options)}>
                    {getDisplayValueForChip(value, options)}
                  </span>
                </Label>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>

        <TextInputGroupUtilities>
          {(!!inputValue || hasRemovableValue) && (
            <Button
              icon={<TimesIcon aria-hidden />}
              variant="plain"
              onClick={onClearButtonClick}
              ouiaId={`${toggleId}-clear-button`}
              aria-label={t("actions.clearInputValue")}
            />
          )}
          {values?.length && hasBadge ? (
            <Badge
              isRead
              aria-label={t("composed.selectedCount", {
                count: values.length,
              })}
            >
              {values.length}
            </Badge>
          ) : null}
        </TextInputGroupUtilities>
      </TextInputGroup>
    </MenuToggle>
  );

  return (
    <Select
      isScrollable={isScrollable}
      maxMenuHeight={maxMenuHeight}
      popperProps={popperProps}
      aria-label={ariaLabel || htmlAriaLabel}
      toggle={toggle}
      selected={values}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          return;
        }
        closeMenu();
        setInputToSelected();
      }}
      onSelect={(_, selection) => onSelect(selection as string)}
      isOpen={isFilterDropdownOpen}
      variant="typeahead"
    >
      <SelectList
        id={`${toggleId}-listbox`}
        // focus can sit on an option (checkbox) while the menu is open
        onKeyDownCapture={onMenuKeyDown}
      >
        {filteredOptions.map(
          ({ groupLabel, label, value, optionProps = {} }, index) => (
            <SelectOption
              {...optionProps}
              {...(!optionProps.isDisabled && { hasCheckbox })}
              key={value}
              id={`${toggleId}-${getStableIndex(value, options)}`}
              value={value}
              isFocused={focusedItemIndex === index}
              isSelected={values?.includes(value)}
              ref={null}
            >
              {!!groupLabel && <Label>{groupLabel}</Label>} {label ?? value}
            </SelectOption>
          )
        )}
        {filteredOptions.length === 0 && (
          <SelectOption
            isDisabled
            hasCheckbox={false}
            key={noResultsId(toggleId)}
            value={noResultsId(toggleId)}
            isSelected={false}
          >
            {t("message.noResultsFoundBodyFor", { input: inputValue })}
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );
};
