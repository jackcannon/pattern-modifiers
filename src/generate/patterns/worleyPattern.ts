import { worleyF1 } from '../worley';

import type { FormObject } from '../../form/schema';
import { CELLULAR_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition } from './types';

export const worleyPattern: PatternDefinition = {
  type: 'worley',
  label: 'Worley',
  category: 'cellular',
  formSections: [{ title: 'Cellular', fields: [...CELLULAR_FIELD_KEYS] }],
  fieldKeys: [...CELLULAR_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.seed, form.scale];
  },
  createContext() {
    return {};
  },
  sample(form, x, y, z) {
    const s = form.scale;
    return worleyF1(form.seed, x / s, y / s, z / s);
  }
};
