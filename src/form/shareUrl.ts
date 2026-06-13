import { formConfig, FormObject, FormPropName, getShareParamName, isFieldActive, PatternType } from './schema';

const buildParamNameDictionary = () => {
  const dict: Record<string, FormPropName> = {};

  for (const [key, config] of Object.entries(formConfig) as [FormPropName, (typeof formConfig)[FormPropName]][]) {
    dict[config.paramName] = key;

    if (config.paramNameByPattern) {
      for (const paramName of Object.values(config.paramNameByPattern)) {
        if (paramName) dict[paramName] = key;
      }
    }
  }

  return dict;
};

const paramNameDictionary = buildParamNameDictionary();

export const isFieldIncludedInShare = (key: FormPropName, form: FormObject): boolean =>
  isFieldActive(formConfig[key], form);

export const queryToForm = (query: string, defaultValues: FormObject): FormObject => {
  const params = Object.fromEntries(new URLSearchParams(query));

  let result: FormObject = { ...defaultValues };

  const typeParam = params[formConfig.type.paramName];
  if (typeParam !== undefined) {
    result = { ...result, type: typeParam as PatternType };
  }

  for (const [paramName, value] of Object.entries(params)) {
    const key = paramNameDictionary[paramName];
    if (!key) continue;

    const config = formConfig[key];
    if (!isFieldActive(config, result)) continue;

    const expectedParam = getShareParamName(key, result.type);
    if (config.paramNameByPattern && paramName !== expectedParam && paramName !== config.paramName) continue;

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
    const paramName = getShareParamName(propName, form.type);

    let valueStr = value.toString();
    if (['switch', 'boolean'].includes(config.type)) {
      valueStr = value ? '1' : '0';
    }

    params.set(paramName, valueStr);
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
