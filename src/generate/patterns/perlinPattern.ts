import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import type { PatternDefinition, PatternSampleContext } from './types';

const NOISE_FIELD_KEYS = ['scale', 'seed', 'octaves', 'persistence'] as const satisfies readonly (keyof FormObject)[];

interface NoiseContext extends PatternSampleContext {
  noise: PerlinNoise3D;
}

export const perlinPattern: PatternDefinition = {
  type: 'perlin',
  label: 'Perlin',
  category: 'noise',
  sectionTitle: 'Perlin noise',
  fieldKeys: [...NOISE_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.octaves, form.persistence];
  },
  createContext(form) {
    return { noise: new PerlinNoise3D(form.seed) };
  },
  sample(form, x, y, z, context) {
    const { noise } = context as NoiseContext;
    const s = form.scale;
    return noise.fbm(x / s, y / s, z / s, form.octaves, form.persistence);
  }
};
