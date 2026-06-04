import { ZodSchema } from 'zod';
import { useEffect, useState } from 'react';

import { formConfig, FormObject, FormPropName } from './form/schema';

const paramNameDictionary = Object.fromEntries(Object.entries(formConfig).map(([key, value]) => [value.paramName, key]));

const queryToObject = (query: string, defaultValues: FormObject): FormObject => {
  const params = Object.fromEntries(new URLSearchParams(query));

  let result: FormObject = { ...defaultValues };

  for (const [paramName, value] of Object.entries(params)) {
    const key = paramNameDictionary[paramName];
    if (!key) continue;

    const config = formConfig[key as FormPropName];
    if (!config) continue;

    let parsedValue: any = value;
    if (['number', 'slider', 'toggle_button'].includes(config.type)) {
      parsedValue = parseFloat(value);
    }
    if (['switch', 'boolean'].includes(config.type)) {
      parsedValue = Boolean(parseInt(value));
    }

    result = {
      ...result,
      [key]: parsedValue
    };
  }

  return result;
};
const objectToQuery = (obj: FormObject): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(obj)) {
    const config = formConfig[key as FormPropName];

    let valueStr = value.toString();
    if (['switch', 'boolean'].includes(config.type)) {
      valueStr = value ? '1' : '0';
    }

    params.set(config.paramName, valueStr);
  }

  return params.toString();
};

const initialise = <T>(schema: ZodSchema, backup: object): T => {
  const startForm = schema.parse(backup);
  try {
    const query = window.location.search;
    const parsed = queryToObject(query, startForm);
    const data = schema.parse(parsed);
    return data;
  } catch (e) {
    console.log('error parsing query', e);
  }
  return startForm;
};

let debounceTimer: ReturnType<typeof setTimeout>;
const debounce = (callback: () => void, time: number) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(callback, time);
};
export const setQuery = (newForm: FormObject) => {
  debounce(() => {
    const query = objectToQuery(newForm);
    window.history.pushState(newForm, '', '?' + query);
  }, 500);
};

export const useHistoryDoc = (schema: ZodSchema, defaultForm: object): [FormObject, (a: FormObject) => void] => {
  const [form, setForm] = useState<FormObject>(() => initialise<FormObject>(schema, defaultForm));
  const doSetForm = (form: FormObject) => {
    setForm(form);
    setQuery(form);
  };
  useEffect(() => {
    const historyChanged = (event: PopStateEvent) => {
      try {
        doSetForm(schema.parse(event.state));
      } catch (e) {
        console.log('error restoring from history');
      }
    };
    window.addEventListener('popstate', historyChanged);
    return () => {
      window.removeEventListener('popstate', historyChanged);
    };
  });
  return [form, doSetForm];
};
