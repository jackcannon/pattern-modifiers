import { GridSpec, marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { HALFTONE_FIELD_KEYS } from './fieldKeys';
import { createHalftoneNoiseSource } from './halftoneNoise';
import { OUTSIDE_FIELD, type ClipFieldSpec, type PatternDefinition, type PatternSampleContext } from './types';

import type { PatternGridContext } from '../patternField';

/** Iso level for the sphere union SDF. Values <= this are solid. */
const HALFTONE_ISO = 0;

interface LatticeCache {
  ix0: number;
  iy0: number;
  iz0: number;
}

interface HalftoneContext extends PatternSampleContext {
  radiiA: Float32Array;
  radiiB: Float32Array;
  jitterAX: Float32Array;
  jitterAY: Float32Array;
  jitterAZ: Float32Array;
  jitterBX: Float32Array;
  jitterBY: Float32Array;
  jitterBZ: Float32Array;
  iMin: number;
  jMin: number;
  kMin: number;
  ni: number;
  nj: number;
  nk: number;
  spacing: number;
  invSpacing: number;
  halfSpacing: number;
  mergeK: number;
  minRadius: number;
  maxRadius: number;
  skipMargin: number;
  strideJ: number;
  strideK: number;
  hardMin: boolean;
  cellRadiiA: Float32Array;
  cellRadiiB: Float32Array;
  cellJxA: Float32Array;
  cellJyA: Float32Array;
  cellJzA: Float32Array;
  cellJxB: Float32Array;
  cellJyB: Float32Array;
  cellJzB: Float32Array;
  cacheA: LatticeCache;
  cacheB: LatticeCache;
  sample: (x: number, y: number, z: number) => number;
}

/** Exponential smooth minimum (Inigo Quilez). */
const sminExp = (a: number, b: number, k: number): number => {
  const diff = a - b;
  if (diff >= k) return b;
  if (-diff >= k) return a;
  const h = (k - Math.abs(diff)) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

const halftoneSizesFromForm = (form: FormObject) => {
  const spacing = form.dotSpacing;
  const inv = spacing / 100;
  return {
    spacing,
    minRadius: inv * form.dotMinSizePct,
    maxRadius: inv * form.dotMaxSizePct,
    mergeK: inv * form.mergeSmoothnessPct
  };
};

const loadCellRadii = (
  radii: Float32Array,
  jitterX: Float32Array,
  jitterY: Float32Array,
  jitterZ: Float32Array,
  cellRadii: Float32Array,
  cellJx: Float32Array,
  cellJy: Float32Array,
  cellJz: Float32Array,
  iMin: number,
  jMin: number,
  kMin: number,
  ni: number,
  nj: number,
  nk: number,
  minRadius: number,
  strideJ: number,
  strideK: number,
  ix0: number,
  iy0: number,
  iz0: number
): void => {
  const baseI = ix0 - iMin;
  const baseJ = iy0 - jMin;
  const baseK = iz0 - kMin;
  let o = 0;
  for (let di = -1; di <= 1; di++) {
    const ii = baseI + di;
    for (let dj = -1; dj <= 1; dj++) {
      const ji = baseJ + dj;
      for (let dk = -1; dk <= 1; dk++) {
        const ki = baseK + dk;
        if (ii < 0 || ji < 0 || ki < 0 || ii >= ni || ji >= nj || ki >= nk) {
          cellRadii[o] = minRadius;
          cellJx[o] = 0;
          cellJy[o] = 0;
          cellJz[o] = 0;
        } else {
          const ri = ii + ji * strideJ + ki * strideK;
          cellRadii[o] = radii[ri];
          cellJx[o] = jitterX[ri];
          cellJy[o] = jitterY[ri];
          cellJz[o] = jitterZ[ri];
        }
        o++;
      }
    }
  }
};

const sdfLattice = (
  ctx: HalftoneContext,
  x: number,
  y: number,
  z: number,
  ox: number,
  oy: number,
  oz: number,
  radii: Float32Array,
  jitterX: Float32Array,
  jitterY: Float32Array,
  jitterZ: Float32Array,
  cellRadii: Float32Array,
  cellJx: Float32Array,
  cellJy: Float32Array,
  cellJz: Float32Array,
  cache: LatticeCache
): number => {
  const { spacing, invSpacing, mergeK, skipMargin, hardMin } = ctx;
  const ix0 = Math.round((x - ox) * invSpacing);
  const iy0 = Math.round((y - oy) * invSpacing);
  const iz0 = Math.round((z - oz) * invSpacing);

  if (ix0 !== cache.ix0 || iy0 !== cache.iy0 || iz0 !== cache.iz0) {
    cache.ix0 = ix0;
    cache.iy0 = iy0;
    cache.iz0 = iz0;
    loadCellRadii(
      radii,
      jitterX,
      jitterY,
      jitterZ,
      cellRadii,
      cellJx,
      cellJy,
      cellJz,
      ctx.iMin,
      ctx.jMin,
      ctx.kMin,
      ctx.ni,
      ctx.nj,
      ctx.nk,
      ctx.minRadius,
      ctx.strideJ,
      ctx.strideK,
      ix0,
      iy0,
      iz0
    );
  }

  const bx = ix0 * spacing + ox;
  const by = iy0 * spacing + oy;
  const bz = iz0 * spacing + oz;
  let sdf: number | null = null;
  let o = 0;

  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let dk = -1; dk <= 1; dk++) {
        const r = cellRadii[o];
        const dx0 = x - bx - di * spacing - cellJx[o];
        const dy0 = y - by - dj * spacing - cellJy[o];
        const dz0 = z - bz - dk * spacing - cellJz[o];
        o++;
        const distSq = dx0 * dx0 + dy0 * dy0 + dz0 * dz0;
        if (sdf !== null) {
          const bound = sdf + skipMargin + r;
          if (bound > 0 && distSq > bound * bound) continue;
        }
        const d = Math.sqrt(distSq) - r;
        if (sdf === null) sdf = d;
        else if (hardMin) {
          if (d < sdf) sdf = d;
        } else {
          sdf = sminExp(sdf, d, mergeK);
        }
      }
    }
  }

  return sdf ?? skipMargin;
};

const sdfAt = (ctx: HalftoneContext, x: number, y: number, z: number): number => {
  const { halfSpacing, mergeK, hardMin } = ctx;
  const sdfA = sdfLattice(
    ctx,
    x,
    y,
    z,
    0,
    0,
    0,
    ctx.radiiA,
    ctx.jitterAX,
    ctx.jitterAY,
    ctx.jitterAZ,
    ctx.cellRadiiA,
    ctx.cellJxA,
    ctx.cellJyA,
    ctx.cellJzA,
    ctx.cacheA
  );
  const sdfB = sdfLattice(
    ctx,
    x,
    y,
    z,
    halfSpacing,
    halfSpacing,
    halfSpacing,
    ctx.radiiB,
    ctx.jitterBX,
    ctx.jitterBY,
    ctx.jitterBZ,
    ctx.cellRadiiB,
    ctx.cellJxB,
    ctx.cellJyB,
    ctx.cellJzB,
    ctx.cacheB
  );

  if (hardMin) return sdfA < sdfB ? sdfA : sdfB;
  return sminExp(sdfA, sdfB, mergeK);
};

const buildContext = (form: FormObject): HalftoneContext => {
  const noise = createHalftoneNoiseSource(form.halftoneNoise, form.seed);
  const { spacing, minRadius, maxRadius, mergeK } = halftoneSizesFromForm(form);
  const invSpacing = 1 / spacing;
  const halfSpacing = spacing * 0.5;
  const radiusSpan = maxRadius - minRadius;
  const invScale = 1 / form.scale;
  const { octaves, persistence } = form;

  const margin = 2;
  const halfW = form.width / 2;
  const halfD = form.depth / 2;
  const h = form.height;

  const iMin = Math.floor((-halfW - spacing * margin - halfSpacing) * invSpacing);
  const iMax = Math.ceil((halfW + spacing * margin + halfSpacing) * invSpacing);
  const jMin = Math.floor((-halfD - spacing * margin - halfSpacing) * invSpacing);
  const jMax = Math.ceil((halfD + spacing * margin + halfSpacing) * invSpacing);
  const kMin = Math.floor((-spacing * margin - halfSpacing) * invSpacing);
  const kMax = Math.ceil((h + spacing * margin + halfSpacing) * invSpacing);

  const ni = iMax - iMin + 1;
  const nj = jMax - jMin + 1;
  const nk = kMax - kMin + 1;
  const count = ni * nj * nk;
  const radiiA = new Float32Array(count);
  const radiiB = new Float32Array(count);
  const jitterAX = new Float32Array(count);
  const jitterAY = new Float32Array(count);
  const jitterAZ = new Float32Array(count);
  const jitterBX = new Float32Array(count);
  const jitterBY = new Float32Array(count);
  const jitterBZ = new Float32Array(count);
  const jitterAmp = spacing * 0.22;

  let idx = 0;
  for (let ki = 0; ki < nk; ki++) {
    const iz = kMin + ki;
    const czA = iz * spacing;
    const czB = czA + halfSpacing;
    for (let ji = 0; ji < nj; ji++) {
      const iy = jMin + ji;
      const cyA = iy * spacing;
      const cyB = cyA + halfSpacing;
      for (let ii = 0; ii < ni; ii++) {
        const ix = iMin + ii;
        const cxA = ix * spacing;
        const cxB = cxA + halfSpacing;
        const jnx = ix * 1.73 + 2.1;
        const jny = iy * 1.73 + 5.7;
        const jnz = iz * 1.73 + 9.2;
        jitterAX[idx] = (noise.noise(jnx, jny, jnz) - 0.5) * 2 * jitterAmp;
        jitterAY[idx] = (noise.noise(jnx + 4.2, jny, jnz) - 0.5) * 2 * jitterAmp;
        jitterAZ[idx] = (noise.noise(jnx, jny + 4.2, jnz) - 0.5) * 2 * jitterAmp;
        jitterBX[idx] = (noise.noise(jnx + 8.1, jny, jnz) - 0.5) * 2 * jitterAmp;
        jitterBY[idx] = (noise.noise(jnx, jny + 8.1, jnz) - 0.5) * 2 * jitterAmp;
        jitterBZ[idx] = (noise.noise(jnx, jny, jnz + 8.1) - 0.5) * 2 * jitterAmp;
        radiiA[idx] = minRadius + noise.fbm(cxA, cyA, czA, invScale, octaves, persistence) * radiusSpan;
        radiiB[idx] = minRadius + noise.fbm(cxB, cyB, czB, invScale, octaves, persistence) * radiusSpan;
        idx++;
      }
    }
  }

  const mergeKValue = mergeK;
  const ctx: HalftoneContext = {
    radiiA,
    radiiB,
    jitterAX,
    jitterAY,
    jitterAZ,
    jitterBX,
    jitterBY,
    jitterBZ,
    iMin,
    jMin,
    kMin,
    ni,
    nj,
    nk,
    spacing,
    invSpacing,
    halfSpacing,
    mergeK: mergeKValue,
    minRadius,
    maxRadius,
    skipMargin: maxRadius + mergeKValue,
    strideJ: ni,
    strideK: ni * nj,
    hardMin: mergeKValue <= 0,
    cellRadiiA: new Float32Array(27),
    cellRadiiB: new Float32Array(27),
    cellJxA: new Float32Array(27),
    cellJyA: new Float32Array(27),
    cellJzA: new Float32Array(27),
    cellJxB: new Float32Array(27),
    cellJyB: new Float32Array(27),
    cellJzB: new Float32Array(27),
    cacheA: { ix0: -99999, iy0: -99999, iz0: -99999 },
    cacheB: { ix0: -99999, iy0: -99999, iz0: -99999 },
    sample: () => 0
  };
  ctx.sample = (x, y, z) => sdfAt(ctx, x, y, z);
  return ctx;
};

const makeGridSpec = (form: FormObject, resolution: number): GridSpec => {
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

const fillHalftoneVolume = (ctx: HalftoneContext, grid: GridSpec, out: Float32Array, invertForMc: boolean): void => {
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;

  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const isPadZ = k === 0 || k === nz - 1;
    const z = z0 + k * sz;
    for (let j = 0; j < ny; j++) {
      const isPadY = j === 0 || j === ny - 1;
      const y = y0 + j * sy;
      for (let i = 0; i < nx; i++) {
        if (isPadZ || isPadY || i === 0 || i === nx - 1) {
          out[idx++] = OUTSIDE_FIELD;
          continue;
        }
        const v = sdfAt(ctx, x0 + i * sx, y, z);
        out[idx++] = invertForMc ? -v : v;
      }
    }
  }
};

const halftoneBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

const buildHalftonePatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = buildContext(form);
  const grid = makeGridSpec(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillHalftoneVolume(ctx, grid, field, false);

  return {
    field,
    grid,
    iso: HALFTONE_ISO,
    bounds: halftoneBounds(form),
    histogram: new Uint32Array(0),
    sampleCount: 0
  };
};

const createHalftoneClipField = (form: FormObject): ClipFieldSpec => {
  const ctx = buildContext(form);
  const { spacing, maxRadius, mergeK } = halftoneSizesFromForm(form);
  const maxCell = Math.min(spacing * 0.45, maxRadius * 0.5, 2);

  return {
    sample: (x, y, z) => sdfAt(ctx, x, y, z),
    iso: HALFTONE_ISO,
    solidHigh: false,
    bounds: halftoneBounds(form),
    maxCellSize: maxCell
  };
};

export const halftonePattern: PatternDefinition = {
  type: 'halftone',
  label: 'Halftone',
  description: 'Stippled dots of varying size on a 3D grid, merging smoothly where they overlap.',
  category: 'effects',
  formSections: [
    { title: 'Halftone', fields: ['halftoneNoise', 'dotSpacing', 'dotMinSizePct', 'dotMaxSizePct', 'mergeSmoothnessPct'] },
    { title: 'Noise', fields: ['scale', 'seed', 'octaves', 'persistence'] }
  ],
  fieldKeys: [...HALFTONE_FIELD_KEYS],
  fixedIso: HALFTONE_ISO,
  fieldDefaults: {
    halftoneNoise: 'perlin',
    dotSpacing: 7,
    dotMinSizePct: 5,
    dotMaxSizePct: 65,
    mergeSmoothnessPct: 30,
    scale: 60,
    octaves: 2,
    persistence: 0.5,
    demoResolution: 80
  },
  cacheKeyParts(form) {
    return [
      form.halftoneNoise,
      form.seed,
      form.scale,
      form.octaves,
      form.persistence,
      form.dotSpacing,
      form.dotMinSizePct,
      form.dotMaxSizePct,
      form.mergeSmoothnessPct
    ];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    return (context as HalftoneContext).sample(x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildHalftonePatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const ctx = buildContext(form);
    const grid = makeGridSpec(form, resolution);
    const mcField = new Float32Array(grid.nx * grid.ny * grid.nz);
    fillHalftoneVolume(ctx, grid, mcField, true);
    return marchingCubes(mcField, grid, HALFTONE_ISO, true);
  },
  createClipField(form) {
    return createHalftoneClipField(form);
  }
};
