import { formConfig, FormObject, FormPropName } from './schema';

const paramNameDictionary = Object.fromEntries(
  Object.entries(formConfig).map(([key, value]) => [value.paramName, key])
);

export const isFieldIncludedInShare = (key: FormPropName, form: FormObject): boolean => {
  const config = formConfig[key];
  if (config.patternId && form.type !== config.patternId) return false;
  return true;
};

export const queryToForm = (query: string, defaultValues: FormObject): FormObject => {
  const params = Object.fromEntries(new URLSearchParams(query));

  let result: FormObject = { ...defaultValues };

  for (const [paramName, value] of Object.entries(params)) {
    const key = paramNameDictionary[paramName];
    if (!key) continue;

    const config = formConfig[key as FormPropName];
    if (!config) continue;

    let parsedValue: unknown = value;
    if (['number', 'slider'].includes(config.type)) {
      parsedValue = parseFloat(value);
    }
    if (config.type === 'toggle_button') {
      const num = parseFloat(value);
      parsedValue = Number.isNaN(num) ? value : num;
    }
    if (['switch', 'boolean'].includes(config.type)) {
      parsedValue = Boolean(parseInt(value, 10));
    }

    result = {
      ...result,
      [key]: parsedValue
    } as FormObject;
  }

  return result;
};

export const formToQuery = (form: FormObject): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(form)) {
    const propName = key as FormPropName;
    if (!isFieldIncludedInShare(propName, form)) continue;

    const config = formConfig[propName];

    let valueStr = value.toString();
    if (['switch', 'boolean'].includes(config.type)) {
      valueStr = value ? '1' : '0';
    }

    params.set(config.paramName, valueStr);
  }

  return params.toString();
};

export const buildShareUrl = (form: FormObject): string => {
  const query = formToQuery(form);
  return `${window.location.origin}${window.location.pathname}?${query}`;
};

export const hasShareQuery = (search: string): boolean => {
  if (!search || search === '?') return false;

  for (const paramName of new URLSearchParams(search).keys()) {
    if (paramNameDictionary[paramName]) return true;
  }

  return false;
};

export const stripQueryFromUrl = () => {
  window.history.replaceState(window.history.state, '', window.location.pathname);
};
