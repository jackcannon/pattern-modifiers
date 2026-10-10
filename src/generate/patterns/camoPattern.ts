import { SimplexNoise3D } from '../simplex';

import type { FormObject } from '../../form/schema';
import { CAMO_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface CamoContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  invS: number;
  squash: number;
  waveDirs: Float64Array;
  wavePhases: Float64Array;
}

// Patches are drawn out along this oblique axis. It has a component on every model axis, so all six
// faces show elongated patches instead of the top face showing round blobs.
const DIR_LEN = Math.hypot(1, 0.55, 0.45);
const DIR_X = 1 / DIR_LEN;
const DIR_Y = 0.55 / DIR_LEN;
const DIR_Z = 0.45 / DIR_LEN;

// The base field is a sum of plane waves that share one wavelength (Feature Size) but point in random
// directions. Unlike FBM, this gives patches of an even size with no large empty areas or tiny specks.
const WAVE_COUNT = 16;
const WAVE_FREQ = Math.PI * 2;
const WAVE_NORM = 0.25 / Math.sqrt(WAVE_COUNT);
// A wave that points almost straight through a face shows on that face as one large flat region, so no
// direction may have a squared component above this on any model axis.
const WAVE_MAX_AXIS_SQ = 0.6;

const WARP_AMP = 0.4;
const WARP_FREQ = 0.93;

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createCamoContext = (form: FormObject): CamoContext => {
  const rand = mulberry32(form.seed * 7919 + 13);
  const waveDirs = new Float64Array(WAVE_COUNT * 3);
  const wavePhases = new Float64Array(WAVE_COUNT);
  for (let i = 0; i < WAVE_COUNT; i++) {
    let dx: number;
    let dy: number;
    let dz: number;
    do {
      dz = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - dz * dz);
      dx = r * Math.cos(a);
      dy = r * Math.sin(a);
    } while (Math.max(dx * dx, dy * dy, dz * dz) > WAVE_MAX_AXIS_SQ);
    waveDirs[i * 3] = dx * WAVE_FREQ;
    waveDirs[i * 3 + 1] = dy * WAVE_FREQ;
    waveDirs[i * 3 + 2] = dz * WAVE_FREQ;
    wavePhases[i] = rand() * Math.PI * 2;
  }

  return {
    noise: new SimplexNoise3D(form.seed),
    invS: 1 / form.scale,
    squash: 1 - 1 / form.camoStretch,
    waveDirs,
    wavePhases
  };
};

const camoValue = (c: CamoContext, x: number, y: number, z: number): number => {
  const { noise, invS, squash, waveDirs, wavePhases } = c;
  const along = (x * DIR_X + y * DIR_Y + z * DIR_Z) * squash;
  const nx = (x - along * DIR_X) * invS;
  const ny = (y - along * DIR_Y) * invS;
  const nz = (z - along * DIR_Z) * invS;

  const wx = nx * WARP_FREQ;
  const wy = ny * WARP_FREQ;
  const wz = nz * WARP_FREQ;
  const px = nx + WARP_AMP * noise.noise(wx + 3.1, wy + 7.7, wz + 1.9);
  const py = ny + WARP_AMP * noise.noise(wx + 8.4, wy + 2.6, wz + 5.3);
  const pz = nz + WARP_AMP * noise.noise(wx + 4.8, wy + 9.2, wz + 6.1);

  let v = 0;
  for (let i = 0, j = 0; i < WAVE_COUNT; i++, j += 3) {
    v += Math.cos(px * waveDirs[j] + py * waveDirs[j + 1] + pz * waveDirs[j + 2] + wavePhases[i]);
  }
  return Math.min(1, Math.max(0, 0.5 + v * WAVE_NORM));
};

export const camoPattern: PatternDefinition = {
  type: 'camo',
  label: 'Camo',
  description: 'Two-tone woodland camouflage with even, lobed patches. Use threshold to control how much of the volume is solid.',
  category: 'effects',
  formSections: [
    { title: 'Camo', fields: ['camoStretch'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...CAMO_FIELD_KEYS],
  fieldDefaults: {
    scale: 45,
    camoStretch: 2,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.camoStretch];
  },
  createContext(form) {
    return createCamoContext(form);
  },
  sample(_form, x, y, z, context) {
    return camoValue(context as CamoContext, x, y, z);
  }
};
