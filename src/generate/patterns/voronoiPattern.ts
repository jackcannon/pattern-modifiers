import { voronoiF2MinusF1 } from '../worley';

import type { FormObject } from '../../form/schema';
import { CELLULAR_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition } from './types';

export const voronoiPattern: PatternDefinition = {
  type: 'voronoi',
  label: 'Voronoi',
  description: 'Solid cell walls between Voronoi regions, forming a network of thin seams through the volume.',
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
    return voronoiF2MinusF1(form.seed, x / s, y / s, z / s);
  }
};
