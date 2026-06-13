import { voronoiF2MinusF1 } from '../worley';

import type { FormObject } from '../../form/schema';
import type { PatternDefinition } from './types';

const CELL_FIELD_KEYS = ['scale', 'seed'] as const satisfies readonly (keyof FormObject)[];

export const voronoiPattern: PatternDefinition = {
  type: 'voronoi',
  label: 'Voronoi',
  category: 'cellular',
  sectionTitle: 'Voronoi noise',
  defaultFieldValues: {
    scale: 18
  },
  fieldKeys: [...CELL_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.seed, form.scale];
  },
  createContext() {
    return {};
  },
  sample(form, x, y, z) {
    const s = form.scale;
    return voronoiF2MinusF1(form.seed, x / s, y / s, z / s);
  }
};
