import { worleyF1 } from '../worley';

import type { FormObject } from '../../form/schema';
import type { PatternDefinition } from './types';

const CELL_FIELD_KEYS = ['scale', 'seed'] as const satisfies readonly (keyof FormObject)[];

export const worleyPattern: PatternDefinition = {
  type: 'worley',
  label: 'Worley',
  category: 'cellular',
  sectionTitle: 'Worley noise',
  fieldKeys: [...CELL_FIELD_KEYS],
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
