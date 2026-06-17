import { ZodSchema } from 'zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { FormObject } from './form/schema';
import { hasResetQuery, hasShareQuery, queryToForm, stripQueryFromUrl } from './form/shareUrl';

const STORAGE_KEY = 'pattern-modifiers-form';
const SAVE_DEBOUNCE_MS = 1000;

interface InitialState {
  form: FormObject;
  stripQueryOnMount: boolean;
}

const loadFromStorage = (schema: ZodSchema): FormObject | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    return schema.parse(JSON.parse(raw)) as FormObject;
  } catch {
    return null;
  }
};

const saveToStorage = (form: FormObject) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    // Quota exceeded, private browsing, or storage disabled.
  }
};

const clearStorage = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
};

const initialise = (schema: ZodSchema, getDefaultForm: () => FormObject): InitialState => {
  const defaults = schema.parse(getDefaultForm()) as FormObject;

  if (hasResetQuery(window.location.search)) {
    clearStorage();
    return { form: defaults, stripQueryOnMount: true };
  }

  if (hasShareQuery(window.location.search)) {
    try {
      const parsed = queryToForm(window.location.search, defaults);
      const form = schema.parse(parsed) as FormObject;
      saveToStorage(form);
      return { form, stripQueryOnMount: true };
    } catch (e) {
      console.log('error parsing share query', e);
      return { form: defaults, stripQueryOnMount: false };
    }
  }

  const stored = loadFromStorage(schema);
  if (stored) {
    return { form: stored, stripQueryOnMount: false };
  }

  return { form: defaults, stripQueryOnMount: false };
};

export const useHistoryDoc = (
  schema: ZodSchema,
  getDefaultForm: () => FormObject
): [FormObject, (form: FormObject) => void, () => void] => {
  const [initial] = useState(() => initialise(schema, getDefaultForm));
  const [form, setForm] = useState<FormObject>(initial.form);
  const skipNextSaveRef = useRef(false);

  const debouncedSave = useDebouncedCallback((value: FormObject) => {
    saveToStorage(value);
  }, SAVE_DEBOUNCE_MS);

  useEffect(() => {
    if (initial.stripQueryOnMount) stripQueryFromUrl();
  }, [initial.stripQueryOnMount]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    debouncedSave(form);
  }, [form, debouncedSave]);

  const resetForm = useCallback(() => {
    debouncedSave.cancel();
    const defaults = schema.parse(getDefaultForm()) as FormObject;
    clearStorage();
    skipNextSaveRef.current = true;
    setForm(defaults);
  }, [schema, getDefaultForm, debouncedSave]);

  return [form, setForm, resetForm];
};
