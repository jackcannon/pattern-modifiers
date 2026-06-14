import type { FormObject } from '../../form/schema';
import { WAVES_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition } from './types';

export const wavesPattern: PatternDefinition = {
  type: 'waves',
  label: 'Waves',
  category: 'surfaces',
  formSections: [{ title: 'Waves', fields: [...WAVES_FIELD_KEYS] }],
  fieldKeys: [...WAVES_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.wavelength, form.amplitude];
  },
  createContext() {
    return {};
  },
  sample(form, x, y, z) {
    const k = (2 * Math.PI) / form.wavelength;
    const a = form.amplitude;
    const v =
      Math.sin(k * x) * a + Math.sin(k * y) * a + Math.sin(k * z) * a;
    const max = 3 * a;
    return v / max + 0.5;
  }
};
