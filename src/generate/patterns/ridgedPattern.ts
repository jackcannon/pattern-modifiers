import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import type { PatternDefinition, PatternSampleContext } from './types';

const NOISE_FIELD_KEYS = ['scale', 'seed', 'octaves', 'persistence'] as const satisfies readonly (keyof FormObject)[];

interface NoiseContext extends PatternSampleContext {
  noise: PerlinNoise3D;
}

export const ridgedPattern: PatternDefinition = {
  type: 'ridged',
  label: 'Ridged',
  category: 'noise',
  sectionTitle: 'Ridged noise',
  defaultFieldValues: {
    scale: 20,
    octaves: 4,
    persistence: 0.5
  },
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
    const nx = x / s;
    const ny = y / s;
    const nz = z / s;

    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let o = 0; o < form.octaves; o++) {
      const n = 1 - Math.abs(noise.noise(nx * frequency, ny * frequency, nz * frequency));
      total += n * n * amplitude;
      maxAmplitude += amplitude;
      amplitude *= form.persistence;
      frequency *= 2;
    }

    return total / maxAmplitude;
  }
};
