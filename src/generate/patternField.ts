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
}

export interface PatternField {
  iso: number;
  maxCellSize: number;
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

  return { field, grid, iso, noise, scale, octaves, persistence, bounds };
};

const isInBounds = (x: number, y: number, z: number, bounds: PatternBounds) =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY && z >= bounds.minZ && z <= bounds.maxZ;

/**
 * Creates a continuous field sampler for clipping demo meshes against the pattern volume.
 *
 * @param {FormObject} form - current form settings
 * @param {number} resolution - grid cells along the longest axis (controls iso accuracy)
 * @returns {PatternField} field sampler
 */
export const createPatternField = (form: FormObject, resolution: number): PatternField => {
  const { iso, noise, scale, octaves, persistence, bounds, grid } = buildPatternGrid(form, resolution);
  const maxCellSize = Math.min(grid.sx, grid.sy, grid.sz);

  const noiseAt = (x: number, y: number, z: number) =>
    noise.fbm(x / scale, y / scale, z / scale, octaves, persistence);

  return {
    iso,
    maxCellSize,
    inBounds: (x, y, z) => isInBounds(x, y, z, bounds),
    noiseAt,
    isSolid: (x, y, z) => isInBounds(x, y, z, bounds) && noiseAt(x, y, z) >= iso
  };
};
