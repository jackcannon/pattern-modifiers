import { getPatternDefinition } from '../generate/patterns/registry';

import {
  FormObject,
  FormPropName,
  FormSchema,
  formConfig,
  getDefaultFileName,
  isFieldActive
} from './schema';

const EXPORT_EXCLUDED_KEYS = new Set<FormPropName>([
  'demoEnabled',
  'demoModel',
  'demoSize',
  'demoResolution',
  'previewResolution'
]);

export const isFieldIncludedInExport = (key: FormPropName, form: FormObject): boolean => {
  if (EXPORT_EXCLUDED_KEYS.has(key)) return false;
  return isFieldActive(key, form);
};

export const formToEffectiveExport = (form: FormObject): Partial<FormObject> =>
  Object.fromEntries(
    (Object.keys(formConfig) as FormPropName[])
      .filter((key) => isFieldIncludedInExport(key, form))
      .map((key) => [key, form[key]])
  ) as Partial<FormObject>;

export const getExportDisplayFileName = (form: FormObject): string => form.fileName.trim() || getDefaultFileName(form);

export const applyExportToForm = (current: FormObject, effective: Partial<FormObject>): FormObject => {
  let result: FormObject = { ...current };

  if (effective.type !== undefined) {
    result = { ...result, type: effective.type };
    Object.assign(result, getPatternDefinition(result.type).fieldDefaults);
  }

  for (const [key, value] of Object.entries(effective)) {
    if (key === 'type') continue;

    const prop = key as FormPropName;
    if (!(prop in formConfig)) continue;
    if (!isFieldIncludedInExport(prop, result)) continue;

    result = { ...result, [prop]: value };
  }

  try {
    return FormSchema.parse(result);
  } catch {
    return result;
  }
};
