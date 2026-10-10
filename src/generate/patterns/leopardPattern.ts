import { SimplexNoise3D } from '../simplex';

import type { FormObject } from '../../form/schema';
import { hash3, LATTICE_ROTATION } from './cellLattice';
import { LEOPARD_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface LeopardContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  seedHash: number;
  invS: number;
  ringRadius: number;
}

// Each rosette is a thin spherical shell around a jittered lattice point. A face cuts shells at different
// depths, so it shows a mix of large rings, small rings and solid spots, like a real coat. All sizes are
// in units of Feature Size (the lattice spacing). Noise added to the ring distance breaks rings into
// C shapes and segments where it is high.
const JITTER = 0.45;
const WARP_AMP = 0.15;
const WARP_FREQ = 1.2;
const BREAK_FREQ = 3;
const FIELD_OFFSET = 0.2;
const BREAK_AMP = 0.26;
const RADIUS_VARIATION = 0.3;

const [R00, R01, R02, R10, R11, R12, R20, R21, R22] = LATTICE_ROTATION;

const createLeopardContext = (form: FormObject): LeopardContext => ({
  noise: new SimplexNoise3D(form.seed),
  seedHash: Math.imul(form.seed | 0, 2654435761),
  invS: 1 / form.scale,
  ringRadius: form.leopardRingSize
});

const leopardValue = (c: LeopardContext, x: number, y: number, z: number): number => {
  const { noise, seedHash, invS, ringRadius } = c;
  const nx = (R00 * x + R01 * y + R02 * z) * invS;
  const ny = (R10 * x + R11 * y + R12 * z) * invS;
  const nz = (R20 * x + R21 * y + R22 * z) * invS;
  const wx = nx * WARP_FREQ;
  const wy = ny * WARP_FREQ;
  const wz = nz * WARP_FREQ;
  const px = nx + WARP_AMP * noise.noise(wx + 3.1, wy + 7.7, wz + 1.9);
  const py = ny + WARP_AMP * noise.noise(wx + 8.4, wy + 2.6, wz + 5.3);
  const pz = nz + WARP_AMP * noise.noise(wx + 4.8, wy + 9.2, wz + 6.1);

  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  let best = Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const ox = cx + 0.5 + JITTER * (hash3(seedHash, cx, cy, cz) - 0.5);
        const oy = cy + 0.5 + JITTER * (hash3(seedHash + 1, cx, cy, cz) - 0.5);
        const oz = cz + 0.5 + JITTER * (hash3(seedHash + 2, cx, cy, cz) - 0.5);
        const r = ringRadius * (1 + RADIUS_VARIATION * (hash3(seedHash + 3, cx, cy, cz) - 0.5));
        const d = Math.abs(Math.hypot(px - ox, py - oy, pz - oz) - r);
        if (d < best) best = d;
      }
    }
  }

  const gap = noise.noise(px * BREAK_FREQ + 31.7, py * BREAK_FREQ + 17.3, pz * BREAK_FREQ + 5.9);
  return Math.min(1, best * 2 + BREAK_AMP * Math.max(0, gap) + FIELD_OFFSET);
};

export const leopardPattern: PatternDefinition = {
  type: 'leopard',
  label: 'Leopard',
  description: 'Broken rings and spots like leopard or jaguar rosettes. Use threshold to control how thick the rings are.',
  category: 'animals',
  formSections: [
    { title: 'Leopard', fields: ['leopardRingSize'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...LEOPARD_FIELD_KEYS],
  fieldDefaults: {
    scale: 36,
    threshold: 30,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.leopardRingSize];
  },
  createContext(form) {
    return createLeopardContext(form);
  },
  sample(_form, x, y, z, context) {
    return leopardValue(context as LeopardContext, x, y, z);
  }
};
