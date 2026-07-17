import { FormObject } from '../form/schema';

import { GridSpec } from './marchingCubes';
import { getPatternDefinition } from './patterns/registry';
import { ClipFieldSpec, OUTSIDE_FIELD, PatternBounds } from './patterns/types';

export type { PatternBounds } from './patterns/types';
export { OUTSIDE_FIELD as OUTSIDE } from './patterns/types';

export interface PatternGridContext {
  field: Float32Array;
  grid: GridSpec;
  iso: number;
  bounds: PatternBounds;
  histogram: Uint32Array;
  sampleCount: number;
}

export interface ClipRuntime {
  iso: number;
  solidHigh: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  samples: Float32Array;
  x0: number;
  y0: number;
  z0: number;
  invSx: number;
  invSy: number;
  invSz: number;
  strideY: number;
  strideZ: number;
  maxI: number;
  maxJ: number;
  maxK: number;
  /** When set, demo clipping evaluates this exact field instead of sampling the voxel grid */
  analytic?: (x: number, y: number, z: number) => number;
  /** Subdivide demo triangles until edges fit the shell thickness before clipping */
  thinShell?: boolean;
  /** Full wall thickness (mm) paired with {@link thinShell} */
  shellThickness?: number;
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
  runtime: ClipRuntime;
}

export interface PatternField {
  iso: number;
  solidHigh: boolean;
  maxCellSize: number;
  clip: ClipField;
  clipRuntime: ClipRuntime;
  inBounds(x: number, y: number, z: number): boolean;
  noiseAt(x: number, y: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
}

/**
 * Builds the sampled pattern grid and iso level used for marching cubes and demo clipping.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis
 * @returns {PatternGridContext} field samples and metadata
 */
export const buildPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const pattern = getPatternDefinition(form.type);
  if (pattern.buildPatternGrid) {
    return pattern.buildPatternGrid(form, resolution);
  }

  const { width, height, depth, threshold } = form;
  const context = pattern.createContext(form);

  const outerW = width;
  const outerD = depth;
  const outerH = height;

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
    z0: -sz,
    sx,
    sy,
    sz
  };

  const bounds: PatternBounds = {
    minX: -outerW / 2,
    maxX: outerW / 2,
    minY: -outerD / 2,
    maxY: outerD / 2,
    minZ: 0,
    maxZ: height
  };

  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  field.fill(OUTSIDE_FIELD);

  const BINS = 1024;
  const histogram = new Uint32Array(BINS);
  let sampleCount = 0;

  const xEnd = grid.nx - 1;
  const yEnd = grid.ny - 1;
  const zEnd = grid.nz - 1;

  for (let k = 1; k < zEnd; k++) {
    const z = grid.z0 + k * grid.sz;
    let rowBase = k * grid.ny * grid.nx;
    for (let j = 1; j < yEnd; j++) {
      rowBase += grid.nx;
      const y = grid.y0 + j * grid.sy;
      let x = grid.x0 + grid.sx;
      let idx = rowBase + 1;
      for (let i = 1; i < xEnd; i++) {
        const value = pattern.sample(form, x, y, z, context);
        field[idx++] = value;
        histogram[Math.min(BINS - 1, Math.max(0, Math.floor(value * BINS)))]++;
        sampleCount++;
        x += grid.sx;
      }
    }
  }

  context.dispose?.();

  const targetBelow = (sampleCount * threshold) / 100;
  let below = 0;
  let isoBin = 0;
  while (isoBin < BINS - 1 && below < targetBelow) {
    below += histogram[isoBin];
    isoBin++;
  }
  const iso = pattern.fixedIso ?? isoBin / BINS;

  return { field, grid, iso, bounds, histogram, sampleCount };
};

/**
 * Prepares scalar field for marching cubes. When low values are solid (`thresholdInverse` false),
 * reflects interior samples around iso so MC can always treat high values as solid; pad cells stay outside.
 *
 * @param {Float32Array} field - sampled noise grid including outside pad cells
 * @param {number} iso - isosurface level
 * @param {boolean} thresholdInverse - when true, high values are solid; when false, low values are solid
 * @returns {Float32Array} field ready for marching cubes (may reuse `field` when inverse is on)
 */
export const prepareMarchingCubesField = (
  field: Float32Array,
  iso: number,
  thresholdInverse: boolean
): Float32Array => {
  if (thresholdInverse) return field;
  const mcField = new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) {
    mcField[i] = field[i] <= OUTSIDE_FIELD / 2 ? OUTSIDE_FIELD : 2 * iso - field[i];
  }
  return mcField;
};

const computeIso = (histogram: Uint32Array, sampleCount: number, threshold: number) => {
  const targetBelow = (sampleCount * threshold) / 100;
  let below = 0;
  let isoBin = 0;
  while (isoBin < histogram.length - 1 && below < targetBelow) {
    below += histogram[isoBin];
    isoBin++;
  }
  return isoBin / histogram.length;
};

interface GridFieldCacheEntry {
  key: string;
  context: PatternGridContext;
  clipRuntime: ClipRuntime;
  sampleGrid: (x: number, y: number, z: number) => number;
}

let gridFieldCache: GridFieldCacheEntry | null = null;
let stablePatternField: PatternField | null = null;
let stableFieldGridKey: string | null = null;

const gridFieldKey = (form: FormObject, resolution: number) => {
  const pattern = getPatternDefinition(form.type);
  return [form.type, resolution, form.width, form.height, form.depth, ...pattern.cacheKeyParts(form)].join(':');
};

const isInBounds = (x: number, y: number, z: number, bounds: PatternBounds) =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY && z >= bounds.minZ && z <= bounds.maxZ;

const createClipRuntime = (
  field: Float32Array,
  grid: GridSpec,
  iso: number,
  bounds: PatternBounds,
  solidHigh: boolean
): ClipRuntime => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;

  return {
    iso,
    solidHigh,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    samples: field,
    x0,
    y0,
    z0,
    invSx: 1 / sx,
    invSy: 1 / sy,
    invSz: 1 / sz,
    strideY: nx,
    strideZ: nx * ny,
    maxI: nx - 2,
    maxJ: ny - 2,
    maxK: nz - 2
  };
};

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
 * Builds a {@link PatternField} backed by an analytic, grid-free clip field (used by patterns whose solid
 * region is too thin to capture reliably on a voxel grid).
 *
 * @param {ClipFieldSpec} spec - analytic field definition
 * @returns {PatternField} field sampler driving demo clipping
 */
const createAnalyticPatternField = (spec: ClipFieldSpec): PatternField => {
  const { sample, iso, solidHigh, bounds, maxCellSize, thinShell, shellThickness } = spec;

  const clipRuntime: ClipRuntime = {
    iso,
    solidHigh,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    samples: new Float32Array(0),
    x0: 0,
    y0: 0,
    z0: 0,
    invSx: 0,
    invSy: 0,
    invSz: 0,
    strideY: 0,
    strideZ: 0,
    maxI: 0,
    maxJ: 0,
    maxK: 0,
    analytic: sample,
    thinShell,
    shellThickness
  };

  const clip: ClipField = {
    iso,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    sample,
    runtime: clipRuntime
  };

  return {
    iso,
    solidHigh,
    maxCellSize,
    clip,
    clipRuntime,
    inBounds: (x, y, z) => isInBounds(x, y, z, bounds),
    noiseAt: sample,
    isSolid: (x, y, z) => {
      if (!isInBounds(x, y, z, bounds)) return false;
      const value = sample(x, y, z);
      return solidHigh ? value >= iso : value <= iso;
    }
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
  const patternDef = getPatternDefinition(form.type);
  if (patternDef.createClipField) {
    const cacheKey = gridFieldKey(form, resolution);
    if (stablePatternField && stableFieldGridKey === cacheKey) return stablePatternField;
    stablePatternField = createAnalyticPatternField(patternDef.createClipField(form, resolution));
    stableFieldGridKey = cacheKey;
    gridFieldCache = null;
    return stablePatternField;
  }

  const cacheKey = gridFieldKey(form, resolution);
  let context: PatternGridContext;
  let clipRuntime: ClipRuntime;
  let sampleGrid: (x: number, y: number, z: number) => number;

  if (gridFieldCache?.key === cacheKey) {
    context = gridFieldCache.context;
    clipRuntime = gridFieldCache.clipRuntime;
    sampleGrid = gridFieldCache.sampleGrid;
  } else {
    context = buildPatternGrid(form, resolution);
    sampleGrid = createGridSampler(context.field, context.grid);
    clipRuntime = createClipRuntime(context.field, context.grid, context.iso, context.bounds, form.thresholdInverse);
    gridFieldCache = { key: cacheKey, context, clipRuntime, sampleGrid };
    stableFieldGridKey = null;
  }

  const pattern = getPatternDefinition(form.type);
  const iso = pattern.fixedIso ?? computeIso(context.histogram, context.sampleCount, form.threshold);
  const solidHigh = pattern.fixedIso !== undefined ? false : form.thresholdInverse;
  clipRuntime.iso = iso;
  clipRuntime.solidHigh = solidHigh;

  const { bounds, grid } = context;
  const maxCellSize = Math.min(grid.sx, grid.sy, grid.sz);
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

  if (stablePatternField && stableFieldGridKey === cacheKey) {
    stablePatternField.iso = iso;
    stablePatternField.solidHigh = solidHigh;
    stablePatternField.maxCellSize = maxCellSize;
    stablePatternField.clip.iso = iso;
    stablePatternField.clip.runtime.solidHigh = solidHigh;
    return stablePatternField;
  }

  const clip: ClipField = {
    iso,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    sample: sampleGrid,
    runtime: clipRuntime
  };

  stablePatternField = {
    iso,
    solidHigh,
    maxCellSize,
    clip,
    clipRuntime,
    inBounds: (x, y, z) => isInBounds(x, y, z, bounds),
    noiseAt: sampleGrid,
    isSolid: (x, y, z) => {
      if (!isInBounds(x, y, z, bounds)) return false;
      const value = sampleGrid(x, y, z);
      return clipRuntime.solidHigh ? value >= clipRuntime.iso : value <= clipRuntime.iso;
    }
  };
  stableFieldGridKey = cacheKey;

  return stablePatternField;
};
