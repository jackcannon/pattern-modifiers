import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { hash3, LATTICE_ROTATION } from './cellLattice';
import { COW_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface CowContext extends PatternSampleContext {
  noise: PerlinNoise3D;
  fineNoise: PerlinNoise3D;
  seedHash: number;
  invS: number;
  patchShare: number;
  sizeVariation: number;
  crinkle: number;
  wobble: number;
}

// Cartoon cow print: one round spot per cell of a jittered lattice, bent into smooth, lobed blobs by two
// slow Perlin warps. Low jitter keeps the spots evenly spread. The field is the distance to the nearest
// spot centre, divided by a random radius for each spot (Size Variation).
const JITTER = 0.3;
// Warps in lattice units, at Wobble 1. The first bends the whole blob and the second adds bays and bumps.
const WARP_AMP = 0.25;
const WARP_FREQ = 1;
const BUMP_AMP = 0.14;
const BUMP_FREQ = 2.2;
// Edge Crinkle is the amplitude of a fast warp at this frequency.
const CRINKLE_FREQ = 6;
// Near the border between the two nearest spots the field goes up by up to LANE_LIFT, so two blobs that
// grow into each other keep a white lane between them, as in a drawn pattern.
const LANE_LIFT = 0.2;
const LANE_WIDTH = 0.2;

const [R00, R01, R02, R10, R11, R12, R20, R21, R22] = LATTICE_ROTATION;

const createCowContext = (form: FormObject): CowContext => ({
  noise: new PerlinNoise3D(form.seed),
  fineNoise: new PerlinNoise3D(form.seed + 53),
  seedHash: Math.imul(form.seed | 0, 2654435761),
  invS: 1 / form.scale,
  patchShare: form.cowPatchSharePct / 100,
  sizeVariation: form.cowSizeVariation,
  crinkle: form.cowEdgeCrinkle,
  wobble: form.cowWobble
});

const cowValue = (c: CowContext, x: number, y: number, z: number): number => {
  const { noise, fineNoise, seedHash, invS, patchShare, sizeVariation, crinkle, wobble } = c;

  let nx = (R00 * x + R01 * y + R02 * z) * invS;
  let ny = (R10 * x + R11 * y + R12 * z) * invS;
  let nz = (R20 * x + R21 * y + R22 * z) * invS;
  let f = WARP_FREQ;
  let a = WARP_AMP * wobble;
  const qx = nx + a * noise.noise(nx * f + 3.1, ny * f + 7.7, nz * f + 1.9);
  const qy = ny + a * noise.noise(nx * f + 8.4, ny * f + 2.6, nz * f + 5.3);
  const qz = nz + a * noise.noise(nx * f + 4.8, ny * f + 9.2, nz * f + 6.1);
  f = BUMP_FREQ;
  a = BUMP_AMP * wobble;
  nx = qx + a * noise.noise(qx * f + 13.1, qy * f + 1.7, qz * f + 4.9);
  ny = qy + a * noise.noise(qx * f + 2.4, qy * f + 12.6, qz * f + 7.3);
  nz = qz + a * noise.noise(qx * f + 6.8, qy * f + 3.2, qz * f + 11.1);
  if (crinkle > 0) {
    f = CRINKLE_FREQ;
    const cx = nx + crinkle * fineNoise.noise(nx * f + 1.3, ny * f + 4.1, nz * f + 7.9);
    const cy = ny + crinkle * fineNoise.noise(nx * f + 6.2, ny * f + 0.7, nz * f + 3.3);
    const cz = nz + crinkle * fineNoise.noise(nx * f + 9.4, ny * f + 5.8, nz * f + 2.2);
    nx = cx;
    ny = cy;
    nz = cz;
  }

  const ix = Math.floor(nx);
  const iy = Math.floor(ny);
  const iz = Math.floor(nz);
  let best = Infinity;
  let second = Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        if (patchShare < 1 && hash3(seedHash + 5, cx, cy, cz) >= patchShare) continue;
        const ox = cx + 0.5 + JITTER * (hash3(seedHash, cx, cy, cz) - 0.5) - nx;
        const oy = cy + 0.5 + JITTER * (hash3(seedHash + 1, cx, cy, cz) - 0.5) - ny;
        const oz = cz + 0.5 + JITTER * (hash3(seedHash + 2, cx, cy, cz) - 0.5) - nz;
        const r = 1 + sizeVariation * (hash3(seedHash + 6, cx, cy, cz) - 0.5);
        const d = Math.sqrt(ox * ox + oy * oy + oz * oz) / r;
        if (d < best) {
          second = best;
          best = d;
        } else if (d < second) second = d;
      }
    }
  }
  if (best === Infinity) return 2;
  return best + LANE_LIFT * Math.max(0, 1 - (second - best) / LANE_WIDTH);
};

export const cowPattern: PatternDefinition = {
  type: 'cow',
  label: 'Cow',
  description: 'Smooth, rounded blobs with white space between them, like a cartoon cow print. Use threshold to control how much of the surface is patches.',
  category: 'animals',
  formSections: [
    { title: 'Cow', fields: ['cowPatchSharePct', 'cowSizeVariation', 'cowEdgeCrinkle', 'cowWobble'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...COW_FIELD_KEYS],
  fieldDefaults: {
    scale: 50,
    threshold: 38,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.cowPatchSharePct, form.cowSizeVariation, form.cowEdgeCrinkle, form.cowWobble];
  },
  createContext(form) {
    return createCowContext(form);
  },
  sample(_form, x, y, z, context) {
    return cowValue(context as CowContext, x, y, z);
  }
};
