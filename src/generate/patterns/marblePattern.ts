import { SimplexNoise3D } from '../simplex';
import { marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { MARBLE_FIELD_KEYS, NOISE_FIELD_KEYS } from './fieldKeys';
import { OUTSIDE_FIELD, type PatternDefinition, type PatternSampleContext } from './types';

import type { GridSpec } from '../marchingCubes';
import type { PatternGridContext } from '../patternField';
import { prepareMarchingCubesField } from '../patternField';

interface MarbleContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  invS: number;
  octaves: number;
  persistence: number;
  amp: number;
  veinSpacing: number;
  useFbm1: boolean;
}

// Fixed offsets used to decorrelate the three components of the domain-warp vector. They are arbitrary
// non-repeating constants so each warp axis samples a different region of the same noise field.
const OFF_X1 = 0;
const OFF_Y1 = 0;
const OFF_Z1 = 0;
const OFF_X2 = 5.2;
const OFF_Y2 = 1.3;
const OFF_Z2 = 8.3;
const OFF_X3 = 2.8;
const OFF_Y3 = 7.4;
const OFF_Z3 = 3.5;

// Second-pass offsets (warp of the warp) for the extra curl that gives the liquid-marble look.
const OFF_X4 = 9.7;
const OFF_Y4 = 2.1;
const OFF_Z4 = 4.6;
const OFF_X5 = 1.4;
const OFF_Y5 = 6.9;
const OFF_Z5 = 0.8;
const OFF_X6 = 7.2;
const OFF_Y6 = 3.3;
const OFF_Z6 = 5.9;

const DIR_X = 0.82;
const DIR_Y = 0.52;
const DIR_Z = 0.24;

const createMarbleContext = (form: FormObject): MarbleContext => {
  const amp = form.swirl * form.veinSpacing * 2;
  return {
    noise: new SimplexNoise3D(form.seed),
    invS: 1 / form.scale,
    octaves: form.octaves,
    persistence: form.persistence,
    amp,
    veinSpacing: form.veinSpacing,
    useFbm1: form.octaves <= 1
  };
};

const marbleValue = (c: MarbleContext, x: number, y: number, z: number): number => {
  const { noise, invS, octaves, persistence, amp, veinSpacing, useFbm1 } = c;
  const nx = x * invS;
  const ny = y * invS;
  const nz = z * invS;

  const fbmAt = (ax: number, ay: number, az: number): number => {
    if (useFbm1) return noise.fbm1(ax, ay, az);
    return noise.fbm(ax, ay, az, octaves, persistence);
  };

  const q1 = fbmAt(nx + OFF_X1, ny + OFF_Y1, nz + OFF_Z1) - 0.5;
  const q2 = fbmAt(nx + OFF_X2, ny + OFF_Y2, nz + OFF_Z2) - 0.5;
  const q3 = fbmAt(nx + OFF_X3, ny + OFF_Y3, nz + OFF_Z3) - 0.5;

  const r1 = fbmAt(nx + 4 * q1 + OFF_X4, ny + 4 * q2 + OFF_Y4, nz + 4 * q3 + OFF_Z4) - 0.5;
  const r2 = fbmAt(nx + 4 * q2 + OFF_X5, ny + 4 * q3 + OFF_Y5, nz + 4 * q1 + OFF_Z5) - 0.5;
  const r3 = fbmAt(nx + 4 * q3 + OFF_X6, ny + 4 * q1 + OFF_Y6, nz + 4 * q2 + OFF_Z6) - 0.5;

  const wx = x + amp * (q1 + 0.4 * r1);
  const wy = y + amp * (q2 + 0.4 * r2);
  const wz = z + amp * (q3 + 0.4 * r3);

  const coord = wx * DIR_X + wy * DIR_Y + wz * DIR_Z;
  const v = Math.sin((coord * Math.PI) / veinSpacing);
  return 0.5 + 0.5 * v;
};

const makeMarbleGrid = (form: FormObject, resolution: number): GridSpec => {
  const { width, height, depth } = form;
  const longest = Math.max(width, depth, height);
  const cellsX = Math.max(2, Math.round((width / longest) * resolution));
  const cellsY = Math.max(2, Math.round((depth / longest) * resolution));
  const cellsZ = Math.max(2, Math.round((height / longest) * resolution));
  const sx = width / cellsX;
  const sy = depth / cellsY;
  const sz = height / cellsZ;

  return {
    nx: cellsX + 3,
    ny: cellsY + 3,
    nz: cellsZ + 3,
    x0: -width / 2 - sx,
    y0: -depth / 2 - sy,
    z0: -sz,
    sx,
    sy,
    sz
  };
};

const fillMarbleVolume = (ctx: MarbleContext, grid: GridSpec, out: Float32Array): void => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
  out.fill(OUTSIDE_FIELD);

  const xEnd = nx - 1;
  const yEnd = ny - 1;
  const zEnd = nz - 1;

  for (let k = 1; k < zEnd; k++) {
    const z = z0 + k * sz;
    let rowBase = k * ny * nx;
    for (let j = 1; j < yEnd; j++) {
      rowBase += nx;
      const y = y0 + j * sy;
      let x = x0 + sx;
      let idx = rowBase + 1;
      for (let i = 1; i < xEnd; i++) {
        out[idx++] = marbleValue(ctx, x, y, z);
        x += sx;
      }
    }
  }
};

const buildMarblePatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = createMarbleContext(form);
  const grid = makeMarbleGrid(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillMarbleVolume(ctx, grid, field);

  const BINS = 1024;
  const histogram = new Uint32Array(BINS);
  let sampleCount = 0;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (v <= OUTSIDE_FIELD / 2) continue;
    histogram[Math.min(BINS - 1, Math.max(0, Math.floor(v * BINS)))]++;
    sampleCount++;
  }

  const targetBelow = (sampleCount * form.threshold) / 100;
  let below = 0;
  let isoBin = 0;
  while (isoBin < BINS - 1 && below < targetBelow) {
    below += histogram[isoBin];
    isoBin++;
  }

  return {
    field,
    grid,
    iso: isoBin / BINS,
    bounds: {
      minX: -form.width / 2,
      maxX: form.width / 2,
      minY: -form.depth / 2,
      maxY: form.depth / 2,
      minZ: 0,
      maxZ: form.height
    },
    histogram,
    sampleCount
  };
};

export const marblePattern: PatternDefinition = {
  type: 'marble',
  label: 'Marble',
  description: 'Flowing veined stone bands with domain-warped noise.',
  category: 'effects',
  formSections: [
    { title: 'Marble', fields: ['veinSpacing', 'swirl'] },
    { title: 'Noise', fields: [...NOISE_FIELD_KEYS] }
  ],
  fieldKeys: [...MARBLE_FIELD_KEYS],
  fieldDefaults: {
    scale: 85,
    octaves: 1,
    persistence: 0.5,
    veinSpacing: 20,
    swirl: 1.3,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.octaves, form.persistence, form.veinSpacing, form.swirl];
  },
  createContext(form) {
    return createMarbleContext(form);
  },
  sample(_form, x, y, z, context) {
    return marbleValue(context as MarbleContext, x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildMarblePatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const { field, grid, iso } = buildMarblePatternGrid(form, resolution);
    const mcField = prepareMarchingCubesField(field, iso, form.thresholdInverse);
    return marchingCubes(mcField, grid, iso, true);
  }
};
