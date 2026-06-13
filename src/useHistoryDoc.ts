import { ZodSchema } from 'zod';
import { useEffect, useState } from 'react';

import { FormObject } from './form/schema';
import { hasShareQuery, queryToForm, stripQueryFromUrl } from './form/shareUrl';

interface InitialState {
  form: FormObject;
  consumedShareQuery: boolean;
}

const initialise = (schema: ZodSchema, getDefaultForm: () => FormObject): InitialState => {
  const defaults = schema.parse(getDefaultForm()) as FormObject;

  if (!hasShareQuery(window.location.search)) {
    return { form: defaults, consumedShareQuery: false };
  }

  try {
    const parsed = queryToForm(window.location.search, defaults);
    return { form: schema.parse(parsed) as FormObject, consumedShareQuery: true };
  } catch (e) {
    console.log('error parsing share query', e);
    return { form: defaults, consumedShareQuery: false };
  }
};

export const useHistoryDoc = (
  schema: ZodSchema,
  getDefaultForm: () => FormObject
): [FormObject, (form: FormObject) => void] => {
  const [initial] = useState(() => initialise(schema, getDefaultForm));
  const [form, setForm] = useState<FormObject>(initial.form);

  useEffect(() => {
    if (initial.consumedShareQuery) stripQueryFromUrl();
  }, [initial.consumedShareQuery]);

  return [form, setForm];
};
