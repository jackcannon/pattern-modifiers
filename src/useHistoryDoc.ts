import { ZodSchema } from 'zod';
import { useCallback, useEffect, useState } from 'react';

import { FormObject } from './form/schema';
import { hasShareQuery, queryToForm, stripQueryFromUrl } from './form/shareUrl';

const STORAGE_KEY = 'pattern-modifiers-form';

interface InitialState {
  form: FormObject;
  consumedShareQuery: boolean;
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

  if (hasShareQuery(window.location.search)) {
    try {
      const parsed = queryToForm(window.location.search, defaults);
      const form = schema.parse(parsed) as FormObject;
      saveToStorage(form);
      return { form, consumedShareQuery: true };
    } catch (e) {
      console.log('error parsing share query', e);
      return { form: defaults, consumedShareQuery: false };
    }
  }

  const stored = loadFromStorage(schema);
  if (stored) {
    return { form: stored, consumedShareQuery: false };
  }

  return { form: defaults, consumedShareQuery: false };
};

export const useHistoryDoc = (
  schema: ZodSchema,
  getDefaultForm: () => FormObject
): [FormObject, (form: FormObject) => void, () => void] => {
  const [initial] = useState(() => initialise(schema, getDefaultForm));
  const [form, setForm] = useState<FormObject>(initial.form);

  useEffect(() => {
    if (initial.consumedShareQuery) stripQueryFromUrl();
  }, [initial.consumedShareQuery]);

  useEffect(() => {
    saveToStorage(form);
  }, [form]);

  const resetForm = useCallback(() => {
    const defaults = schema.parse(getDefaultForm()) as FormObject;
    clearStorage();
    setForm(defaults);
  }, [schema, getDefaultForm]);

  return [form, setForm, resetForm];
};
