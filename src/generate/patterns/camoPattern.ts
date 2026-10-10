import { CAMO_FIELD_KEYS } from './fieldKeys';
import { camoFieldValue, createCamoFieldContext, type CamoFieldContext } from './camoField';
import type { PatternDefinition } from './types';

export const camoPattern: PatternDefinition = {
  type: 'camo',
  label: 'Camo',
  description: 'Two-tone woodland camouflage with even, lobed patches. Use threshold to control how much of the volume is solid.',
  category: 'effects',
  formSections: [
    { title: 'Camo', fields: ['camoStretch'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...CAMO_FIELD_KEYS],
  fieldDefaults: {
    scale: 45,
    camoStretch: 2,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.camoStretch];
  },
  createContext(form) {
    return createCamoFieldContext({ seed: form.seed, scale: form.scale, stretch: form.camoStretch });
  },
  sample(_form, x, y, z, context) {
    return camoFieldValue(context as CamoFieldContext, x, y, z);
  }
};
