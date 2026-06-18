import { SimplexNoise3D } from '../simplex';
import { voronoiF2MinusF1 } from '../worley';
import { marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { CELLULAR_FIELD_KEYS, KINTSUGI_FIELD_KEYS } from './fieldKeys';
import type { ClipFieldSpec, PatternDefinition, PatternSampleContext } from './types';

import type { GridSpec } from '../marchingCubes';
import type { PatternGridContext } from '../patternField';
import { OUTSIDE_FIELD } from './types';

interface KintsugiContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  seed: number;
  invCellSize: number;
  cellSize: number;
  crackWidth: number;
  jag: number;
  fw: number;
  jagScale: number;
}

// The crack boundary always sits at this iso. Crack width is baked into the field instead (see crackValue),
// so the same constant iso works for any Crack Width setting.
const CRACK_ISO = 0.5;

// Offsets that decorrelate the three warp axes so the organic distortion is not the same on each axis.
const WARP_OFF_X = 0;
const WARP_OFF_Y = 3.7;
const WARP_OFF_Z = 8.1;

/**
 * Continuous crack field. Returns a value that dips below {@link CRACK_ISO} inside the thin walls running along
 * the Voronoi cell boundaries and rises above it through the cell interiors, so low values are the solid cracks.
 *
 * @param {SimplexNoise3D} noise - warp noise source
 * @param {number} seed - cell layout seed
 * @param {number} x - sample X (mm)
 * @param {number} y - sample Y (mm)
 * @param {number} z - sample Z (mm)
 * @param {number} cellSize - Voronoi cell size (mm)
 * @param {number} crackWidth - crack wall thickness (mm)
 * @param {number} jag - warp amplitude (mm) controlling how organic the crack edges are
 * @returns {number} field value where <= {@link CRACK_ISO} is solid crack
 */
const crackValueFromContext = (c: KintsugiContext, x: number, y: number, z: number): number => {
  const { noise, seed, invCellSize, cellSize, crackWidth, jag, fw, jagScale } = c;
  let wx = x;
  let wy = y;
  let wz = z;

  if (jag > 0) {
    const nx = x * fw;
    const ny = y * fw;
    const nz = z * fw;
    wx = x + jagScale * noise.noise(nx + WARP_OFF_X, ny, nz);
    wy = y + jagScale * noise.noise(nx, ny + WARP_OFF_Y, nz);
    wz = z + jagScale * noise.noise(nx, ny, nz + WARP_OFF_Z);
  }

  const edge = voronoiF2MinusF1(seed, wx * invCellSize, wy * invCellSize, wz * invCellSize);
  return Math.min(1, (edge * cellSize) / (4 * crackWidth));
};

const makeKintsugiGrid = (form: FormObject, resolution: number): GridSpec => {
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

const fillKintsugiVolume = (ctx: KintsugiContext, grid: GridSpec, out: Float32Array, invertForMc: boolean): void => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
  out.fill(OUTSIDE_FIELD);

  const xEnd = nx - 1;
  const yEnd = ny - 1;
  const zEnd = nz - 1;
  const neg = invertForMc;

  for (let k = 1; k < zEnd; k++) {
    const z = z0 + k * sz;
    let rowBase = k * ny * nx;
    for (let j = 1; j < yEnd; j++) {
      rowBase += nx;
      const y = y0 + j * sy;
      let x = x0 + sx;
      let idx = rowBase + 1;
      for (let i = 1; i < xEnd; i++) {
        const v = crackValueFromContext(ctx, x, y, z);
        out[idx++] = neg ? CRACK_ISO * 2 - v : v;
        x += sx;
      }
    }
  }
};

const buildKintsugiPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = createKintsugiContext(form);
  const grid = makeKintsugiGrid(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillKintsugiVolume(ctx, grid, field, false);

  return {
    field,
    grid,
    iso: CRACK_ISO,
    bounds: {
      minX: -form.width / 2,
      maxX: form.width / 2,
      minY: -form.depth / 2,
      maxY: form.depth / 2,
      minZ: 0,
      maxZ: form.height
    },
    histogram: new Uint32Array(0),
    sampleCount: 0
  };
};

const createKintsugiContext = (form: FormObject): KintsugiContext => {
  const cellSize = form.scale;
  const jag = form.crackJaggedness;
  return {
    noise: new SimplexNoise3D(form.seed),
    seed: form.seed,
    invCellSize: 1 / cellSize,
    cellSize,
    crackWidth: form.crackWidth,
    jag,
    fw: jag > 0 ? 1 / (cellSize * 0.35) : 0,
    jagScale: jag
  };
};

const createKintsugiClipField = (form: FormObject, _resolution: number): ClipFieldSpec => {
  const ctx = createKintsugiContext(form);

  return {
    sample: (x, y, z) => crackValueFromContext(ctx, x, y, z),
    iso: CRACK_ISO,
    solidHigh: false,
    bounds: {
      minX: -form.width / 2,
      maxX: form.width / 2,
      minY: -form.depth / 2,
      maxY: form.depth / 2,
      minZ: 0,
      maxZ: form.height
    },
    // Keep demo-mesh edges finer than the crack walls so the thin cracks survive the clip.
    maxCellSize: Math.max(0.6, Math.min(ctx.crackWidth, 4))
  };
};

export const kintsugiPattern: PatternDefinition = {
  type: 'kintsugi',
  label: 'Kintsugi',
  description: 'Thin solid cracks along warped Voronoi cell edges, like repaired pottery seams.',
  category: 'effects',
  formSections: [
    { title: 'Kintsugi', fields: ['crackWidth', 'crackJaggedness'] },
    { title: 'Cellular', fields: [...CELLULAR_FIELD_KEYS] }
  ],
  fieldKeys: [...KINTSUGI_FIELD_KEYS],
  // Crack walls are thin solid sheets, so own the iso directly: values <= CRACK_ISO are solid and the global
  // threshold controls are hidden (they would not map sensibly onto a fixed-width crack).
  fixedIso: CRACK_ISO,
  fieldDefaults: {
    scale: 40,
    crackWidth: 1,
    crackJaggedness: 1,
    demoResolution: 96
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.crackWidth, form.crackJaggedness];
  },
  createContext(form) {
    return createKintsugiContext(form);
  },
  sample(form, x, y, z, context) {
    return crackValueFromContext(context as KintsugiContext, x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildKintsugiPatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const ctx = createKintsugiContext(form);
    const grid = makeKintsugiGrid(form, resolution);
    const mcField = new Float32Array(grid.nx * grid.ny * grid.nz);
    fillKintsugiVolume(ctx, grid, mcField, true);
    return marchingCubes(mcField, grid, CRACK_ISO, true);
  },
  createClipField(form, resolution) {
    return createKintsugiClipField(form, resolution);
  }
};
