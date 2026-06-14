import { formConfig, FormObject, FormPropName, isFieldActive, PatternType } from './schema';

/** Previous per-pattern URL param names. Still accepted when loading share links */
const LEGACY_PARAM_ALIASES: Record<string, FormPropName> = {
  per_s: 'seed',
  sim_s: 'seed',
  rid_s: 'seed',
  wor_s: 'seed',
  vor_s: 'seed',
  per_sc: 'scale',
  sim_sc: 'scale',
  rid_sc: 'scale',
  wor_sc: 'scale',
  vor_sc: 'scale',
  per_oc: 'octaves',
  sim_oc: 'octaves',
  rid_oc: 'octaves',
  per_p: 'persistence',
  sim_p: 'persistence',
  rid_p: 'persistence',
  gyr_p: 'period',
  gyr_ph: 'phase',
  wav_wl: 'wavelength',
  wav_a: 'amplitude',
  lat_sp: 'strutSpacing',
  lat_r: 'strutRadius'
};

const buildParamNameDictionary = () => {
  const dict: Record<string, FormPropName> = { ...LEGACY_PARAM_ALIASES };

  for (const [key, config] of Object.entries(formConfig) as [FormPropName, (typeof formConfig)[FormPropName]][]) {
    dict[config.paramName] = key;
  }

  return dict;
};

const paramNameDictionary = buildParamNameDictionary();

export const isFieldIncludedInShare = (key: FormPropName, form: FormObject): boolean => isFieldActive(key, form);

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
    if (!isFieldActive(key, result)) continue;

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
