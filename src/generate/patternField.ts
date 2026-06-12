import { FormObject } from '../form/schema';

import { GridSpec } from './marchingCubes';
import { PerlinNoise3D } from './perlin';

const OUTSIDE = -1e9;

export interface PatternBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface PatternGridContext {
  field: Float32Array;
  grid: GridSpec;
  iso: number;
  noise: PerlinNoise3D;
  scale: number;
  octaves: number;
  persistence: number;
  bounds: PatternBounds;
  histogram: Uint32Array;
  sampleCount: number;
}

export interface ClipField {
  iso: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  sample(x: number, y: number, z: number): number;
}

export interface PatternField {
  iso: number;
  maxCellSize: number;
  clip: ClipField;
  inBounds(x: number, y: number, z: number): boolean;
  noiseAt(x: number, y: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
}

/**
 * Builds the sampled noise grid and iso level used for marching cubes and demo clipping.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis
 * @returns {PatternGridContext} field samples and metadata
 */
export const buildPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const { width, height, depth, overflow, seed, scale, threshold, octaves, persistence } = form;

  const outerW = width + overflow * 2;
  const outerD = depth + overflow * 2;
  const outerH = height + overflow * 2;

  const longest = Math.max(outerW, outerD, outerH);
  const cellsX = Math.max(2, Math.round((outerW / longest) * resolution));
  const cellsY = Math.max(2, Math.round((outerD / longest) * resolution));
  const cellsZ = Math.max(2, Math.round((outerH / longest) * resolution));

  const sx = outerW / cellsX;
  const sy = outerD / cellsY;
  const sz = outerH / cellsZ;

  const grid: GridSpec = {
    nx: cellsX + 3,
    ny: cellsY + 3,
    nz: cellsZ + 3,
    x0: -outerW / 2 - sx,
    y0: -outerD / 2 - sy,
    z0: -overflow - sz,
    sx,
    sy,
    sz
  };

  const bounds: PatternBounds = {
    minX: -outerW / 2,
    maxX: outerW / 2,
    minY: -outerD / 2,
    maxY: outerD / 2,
    minZ: -overflow,
    maxZ: height + overflow
  };

  const noise = new PerlinNoise3D(seed);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);

  const BINS = 1024;
  const histogram = new Uint32Array(BINS);
  let sampleCount = 0;

  let idx = 0;
  for (let k = 0; k < grid.nz; k++) {
    const isPadZ = k === 0 || k === grid.nz - 1;
    const z = grid.z0 + k * sz;
    for (let j = 0; j < grid.ny; j++) {
      const isPadY = j === 0 || j === grid.ny - 1;
      const y = grid.y0 + j * sy;
      for (let i = 0; i < grid.nx; i++) {
        const isPadX = i === 0 || i === grid.nx - 1;

        if (isPadX || isPadY || isPadZ) {
          field[idx++] = OUTSIDE;
          continue;
        }

        const x = grid.x0 + i * sx;
        const value = noise.fbm(x / scale, y / scale, z / scale, octaves, persistence);
        field[idx++] = value;

        histogram[Math.min(BINS - 1, Math.max(0, Math.floor(value * BINS)))]++;
        sampleCount++;
      }
    }
  }

  const targetSolid = (sampleCount * threshold) / 100;
  let above = 0;
  let isoBin = BINS - 1;
  while (isoBin > 0 && above < targetSolid) {
    above += histogram[isoBin];
    isoBin--;
  }
  const iso = (isoBin + 1) / BINS;

  return { field, grid, iso, noise, scale, octaves, persistence, bounds, histogram, sampleCount };
};

const computeIso = (histogram: Uint32Array, sampleCount: number, threshold: number) => {
  const targetSolid = (sampleCount * threshold) / 100;
  let above = 0;
  let isoBin = histogram.length - 1;
  while (isoBin > 0 && above < targetSolid) {
    above += histogram[isoBin];
    isoBin--;
  }
  return (isoBin + 1) / histogram.length;
};

interface GridFieldCacheEntry {
  key: string;
  context: PatternGridContext;
}

let gridFieldCache: GridFieldCacheEntry | null = null;

const gridFieldKey = (form: FormObject, resolution: number) =>
  [
    resolution,
    form.width,
    form.height,
    form.depth,
    form.overflow,
    form.seed,
    form.scale,
    form.octaves,
    form.persistence
  ].join(':');

const isInBounds = (x: number, y: number, z: number, bounds: PatternBounds) =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY && z >= bounds.minZ && z <= bounds.maxZ;

const createGridSampler = (field: Float32Array, grid: GridSpec) => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
  const strideY = nx;
  const strideZ = nx * ny;
  const maxI = nx - 2;
  const maxJ = ny - 2;
  const maxK = nz - 2;
  const invSx = 1 / sx;
  const invSy = 1 / sy;
  const invSz = 1 / sz;

  return (x: number, y: number, z: number): number => {
    const fx = (x - x0) * invSx;
    const fy = (y - y0) * invSy;
    const fz = (z - z0) * invSz;

    const i0 = fx < 0 ? 0 : fx > maxI ? maxI : fx | 0;
    const j0 = fy < 0 ? 0 : fy > maxJ ? maxJ : fy | 0;
    const k0 = fz < 0 ? 0 : fz > maxK ? maxK : fz | 0;

    const tx = fx - i0;
    const ty = fy - j0;
    const tz = fz - k0;

    const base = i0 + j0 * strideY + k0 * strideZ;
    const c000 = field[base];
    const c100 = field[base + 1];
    const c010 = field[base + strideY];
    const c110 = field[base + 1 + strideY];
    const c001 = field[base + strideZ];
    const c101 = field[base + 1 + strideZ];
    const c011 = field[base + strideY + strideZ];
    const c111 = field[base + 1 + strideY + strideZ];

    const c00 = c000 + (c100 - c000) * tx;
    const c10 = c010 + (c110 - c010) * tx;
    const c01 = c001 + (c101 - c001) * tx;
    const c11 = c011 + (c111 - c011) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  };
};

/**
 * Creates a continuous field sampler for clipping demo meshes against the pattern volume.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis (controls iso accuracy)
 * @returns {PatternField} field sampler
 */
export const createPatternField = (form: FormObject, resolution: number): PatternField => {
  const cacheKey = gridFieldKey(form, resolution);
  let context: PatternGridContext;

  if (gridFieldCache?.key === cacheKey) {
    context = gridFieldCache.context;
  } else {
    context = buildPatternGrid(form, resolution);
    gridFieldCache = { key: cacheKey, context };
  }

  const iso = computeIso(context.histogram, context.sampleCount, form.threshold);
  const { field, bounds, grid } = context;
  const maxCellSize = Math.min(grid.sx, grid.sy, grid.sz);
  const sampleGrid = createGridSampler(field, grid);
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const clip: ClipField = { iso, minX, maxX, minY, maxY, minZ, maxZ, sample: sampleGrid };

  return {
    iso,
    maxCellSize,
    clip,
    inBounds: (x, y, z) => isInBounds(x, y, z, bounds),
    noiseAt: sampleGrid,
    isSolid: (x, y, z) => isInBounds(x, y, z, bounds) && sampleGrid(x, y, z) >= iso
  };
};
