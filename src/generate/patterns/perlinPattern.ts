import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { NOISE_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface NoiseContext extends PatternSampleContext {
  noise: PerlinNoise3D;
}

export const perlinPattern: PatternDefinition = {
  type: 'perlin',
  label: 'Perlin',
  category: 'noise',
  formSections: [{ title: 'Noise', fields: [...NOISE_FIELD_KEYS] }],
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
