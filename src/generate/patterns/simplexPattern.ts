import { SimplexNoise3D } from '../simplex';

import type { FormObject } from '../../form/schema';
import type { PatternDefinition, PatternSampleContext } from './types';

const NOISE_FIELD_KEYS = ['scale', 'seed', 'octaves', 'persistence'] as const satisfies readonly (keyof FormObject)[];

interface NoiseContext extends PatternSampleContext {
  noise: SimplexNoise3D;
}

export const simplexPattern: PatternDefinition = {
  type: 'simplex',
  label: 'Simplex',
  category: 'noise',
  sectionTitle: 'Simplex noise',
  fieldKeys: [...NOISE_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.octaves, form.persistence];
  },
  createContext(form) {
    return { noise: new SimplexNoise3D(form.seed) };
  },
  sample(form, x, y, z, context) {
    const { noise } = context as NoiseContext;
    const s = form.scale;
    return noise.fbm(x / s, y / s, z / s, form.octaves, form.persistence);
  }
};
