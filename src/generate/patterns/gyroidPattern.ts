import type { FormObject } from '../../form/schema';
import { GYROID_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition } from './types';

export const gyroidPattern: PatternDefinition = {
  type: 'gyroid',
  label: 'Gyroid',
  description: 'Triply periodic minimal surface with continuous lattice-like channels woven through the volume.',
  category: 'surfaces',
  formSections: [{ title: 'Gyroid', fields: [...GYROID_FIELD_KEYS] }],
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
