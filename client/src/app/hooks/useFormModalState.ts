import { useCallback, useState } from "react";

/**
 * State for a modal that hosts a create/edit form.
 *
 * PatternFly keeps a closing Modal's content mounted until its close
 * animation ends. A form re-opened during that window (or re-opened for a
 * different item) would keep the previous form's state, because react-hook-form
 * reads `defaultValues` only on mount. Give the form `key={formKey}`: the key
 * changes on every open, so each opening mounts a fresh form.
 *
 * @returns `[value, setValue, formKey]`; `value` is `null` while closed.
 */
export const useFormModalState = <T>(): [
  T | null,
  (next: T | null) => void,
  number,
] => {
  const [value, setValue] = useState<T | null>(null);
  const [formKey, setFormKey] = useState(0);
  const set = useCallback((next: T | null) => {
    if (next !== null) setFormKey((key) => key + 1);
    setValue(next);
  }, []);
  return [value, set, formKey];
};
