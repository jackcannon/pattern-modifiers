import type { FormObject } from '../../form/schema';
import type { PatternDefinition } from './types';

const GYROID_FIELD_KEYS = ['period', 'phase'] as const satisfies readonly (keyof FormObject)[];

export const gyroidPattern: PatternDefinition = {
  type: 'gyroid',
  label: 'Gyroid',
  category: 'surfaces',
  sectionTitle: 'Gyroid surface',
  fieldKeys: [...GYROID_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.period, form.phase];
  },
  createContext() {
    return {};
  },
  sample(form, x, y, z) {
    const k = (2 * Math.PI) / form.period;
    const p = form.phase;
    const v =
      Math.sin(k * x + p) * Math.cos(k * y + p) +
      Math.sin(k * y + p) * Math.cos(k * z + p) +
      Math.sin(k * z + p) * Math.cos(k * x + p);
    return v / 3 + 0.5;
  }
};
