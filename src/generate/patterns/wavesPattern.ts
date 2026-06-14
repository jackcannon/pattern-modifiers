import type { FormObject } from '../../form/schema';
import type { PatternDefinition } from './types';

const WAVES_FIELD_KEYS = ['wavelength', 'amplitude'] as const satisfies readonly (keyof FormObject)[];

export const wavesPattern: PatternDefinition = {
  type: 'waves',
  label: 'Waves',
  category: 'surfaces',
  sectionTitle: 'Wave bands',
  defaultFieldValues: {
    wavelength: 50,
    amplitude: 0.35
  },
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
