import { PerlinNoise3D } from '../perlin';
import { SimplexNoise3D } from '../simplex';

import type { HalftoneNoiseType } from '../../form/schema';

export interface HalftoneNoiseSource {
  fbm(x: number, y: number, z: number, invScale: number, octaves: number, persistence: number): number;
  /** Single octave in roughly [-1, 1] for jitter displacement */
  noise(x: number, y: number, z: number): number;
}

const ridgedFbm = (
  noise: PerlinNoise3D,
  x: number,
  y: number,
  z: number,
  invScale: number,
  octaves: number,
  persistence: number
): number => {
  const nx = x * invScale;
  const ny = y * invScale;
  const nz = z * invScale;

  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise.noise(nx * frequency, ny * frequency, nz * frequency));
    total += n * n * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxAmplitude;
};

/**
 * Noise source for halftone dot-size sampling (Perlin, Simplex, or Ridged FBM).
 *
 * @param {HalftoneNoiseType} type - underlying noise pattern
 * @param {number} seed - random seed
 */
export const createHalftoneNoiseSource = (type: HalftoneNoiseType, seed: number): HalftoneNoiseSource => {
  if (type === 'simplex') {
    const noise = new SimplexNoise3D(seed);
    return {
      fbm(x, y, z, invScale, octaves, persistence) {
        const nx = x * invScale;
        const ny = y * invScale;
        const nz = z * invScale;
        if (octaves <= 1) return noise.noise(nx, ny, nz) / 2 + 0.5;
        if (octaves === 2) return noise.fbm2(nx, ny, nz, persistence);
        if (octaves === 4) return noise.fbm4(nx, ny, nz, persistence);
        return noise.fbm(nx, ny, nz, octaves, persistence);
      },
      noise: (x, y, z) => noise.noise(x, y, z)
    };
  }

  const noise = new PerlinNoise3D(seed);
  if (type === 'ridged') {
    return {
      fbm: (x, y, z, invScale, octaves, persistence) => ridgedFbm(noise, x, y, z, invScale, octaves, persistence),
      noise: (x, y, z) => noise.noise(x, y, z)
    };
  }

  return {
    fbm(x, y, z, invScale, octaves, persistence) {
      const nx = x * invScale;
      const ny = y * invScale;
      const nz = z * invScale;
      if (octaves <= 1) return noise.noise(nx, ny, nz) / 2 + 0.5;
      return noise.fbm(nx, ny, nz, octaves, persistence);
    },
    noise: (x, y, z) => noise.noise(x, y, z)
  };
};
