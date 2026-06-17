import type { FormObject } from '../../form/schema';

import type { HalftoneNoiseSource } from './halftoneNoise';
import { OUTSIDE_FIELD } from './types';

import type { GridSpec } from '../marchingCubes';

/** Iso level for hatch line SDF union. Values <= this are solid. */
export const HATCH_LINE_ISO = 0;

export interface HatchPlaneCoeffs {
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dy: number;
  dz: number;
  familyOff: number;
}

export interface HatchLineSizes {
  spacing: number;
  invSpacing: number;
  minWidth: number;
  widthSpan: number;
  mergeK: number;
  lineJitterScale: number;
  outsidePadding: number;
}

export interface HatchLineNoiseState {
  noise: HalftoneNoiseSource;
  invScale: number;
  octaves: number;
  persistence: number;
  wobbleAmp: number;
  wobbleInvScale: number;
  /** Precomputed width sampling path for hot loops. */
  widthToneMode: 'one' | 'two' | 'fbm';
  invNorm2: number;
}

export interface CrosshatchFillCtx {
  state: HatchLineNoiseState;
  sizes: HatchLineSizes;
  plane1: HatchPlaneCoeffs;
  plane2: HatchPlaneCoeffs;
  crossStart: number;
  crossInv: number;
  hardMin: boolean;
}

export interface ParallelFillCtx {
  state: HatchLineNoiseState;
  sizes: HatchLineSizes;
  plane: HatchPlaneCoeffs;
  hardMin: boolean;
}

/** Exponential smooth minimum (Inigo Quilez). */
export const sminExp = (a: number, b: number, k: number): number => {
  if (k <= 0) return a < b ? a : b;
  const diff = a - b;
  if (diff >= k) return b;
  if (-diff >= k) return a;
  const h = (k - Math.abs(diff)) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return [0, 1, 0];
  return [x / len, y / len, z / len];
};

/** Build unit plane normal and in-plane stroke direction. Called once per context build. */
export const buildHatchPlaneCoeffs = (nx: number, ny: number, nz: number, familyOff: number): HatchPlaneCoeffs => {
  const [nnx, nny, nnz] = normalize3(nx, ny, nz);
  let dx = nny;
  let dy = -nnx;
  let dz = 0;
  let len = Math.hypot(dx, dy, dz);
  if (len < 0.12) {
    dx = -nnz;
    dy = 0;
    dz = nnx;
    len = Math.hypot(dx, dy, dz);
  }
  const invLen = 1 / len;
  return {
    nx: nnx,
    ny: nny,
    nz: nnz,
    dx: dx * invLen,
    dy: dy * invLen,
    dz: dz * invLen,
    familyOff
  };
};

/** Width and merge sizes derived from hatch spacing form fields (% of spacing). */
export const hatchLineSizesFromForm = (form: FormObject) => {
  const spacing = form.hatchSpacing;
  const inv = spacing / 100;
  const minWidth = inv * form.hatchMinWidthPct;
  const mergeK = inv * form.mergeSmoothnessPct;
  return {
    spacing,
    invSpacing: 1 / spacing,
    minWidth,
    widthSpan: inv * form.hatchMaxWidthPct - minWidth,
    mergeK,
    lineJitterScale: spacing * 0.12,
    outsidePadding: minWidth + mergeK
  };
};

export const makeHatchGridSpec = (form: FormObject, resolution: number): GridSpec => {
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

export const hatchLineBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

export const hatchClipMaxCell = (spacing: number, maxWidth: number) => Math.min(spacing * 0.38, maxWidth * 0.65, 1.6);

/** Wobble uses fixed 2-octave FBM; unrolled to skip fbm dispatch. */
const wobbleShift = (
  noise: HalftoneNoiseSource,
  along: number,
  familyOff: number,
  wobbleInvScale: number,
  wobbleAmp: number
): number => {
  const wx = (along * wobbleInvScale + familyOff) * wobbleInvScale;
  const wy = (along * 0.27 + familyOff + 1.3) * wobbleInvScale;
  const wz = (along * 0.13 + familyOff + 4.1) * wobbleInvScale;
  const n0 = noise.noise(wx, wy, wz);
  const n1 = noise.noise(wx * 2, wy * 2, wz * 2);
  const w = (n0 + n1 * 0.5) / 3;
  return w * (2 * wobbleAmp);
};

/** Width tone in [0,1]; branch on precomputed mode to avoid per-sample octave checks. */
const widthTone = (
  noise: HalftoneNoiseSource,
  lx: number,
  ly: number,
  lz: number,
  invScale: number,
  mode: HatchLineNoiseState['widthToneMode'],
  invNorm2: number,
  octaves: number,
  persistence: number
): number => {
  const nx = lx * invScale;
  const ny = ly * invScale;
  const nz = lz * invScale;

  if (mode === 'one') return noise.noise(nx, ny, nz) / 2 + 0.5;

  if (mode === 'two') {
    const n0 = noise.noise(nx, ny, nz);
    const n1 = noise.noise(nx * 2, ny * 2, nz * 2);
    return (n0 + n1 * persistence) * invNorm2 * 0.5 + 0.5;
  }

  return noise.fbm(lx, ly, lz, invScale, octaves, persistence);
};

const hatchPlaneSdfCore = (
  state: HatchLineNoiseState,
  sizes: HatchLineSizes,
  nx: number,
  ny: number,
  nz: number,
  dx: number,
  dy: number,
  dz: number,
  familyOff: number,
  x: number,
  y: number,
  z: number,
  secondFamily: boolean,
  crossStart: number,
  crossInv: number
): number => {
  const { noise, wobbleAmp, wobbleInvScale, invScale, widthToneMode, invNorm2, octaves, persistence } = state;
  const { invSpacing, spacing, lineJitterScale, minWidth, widthSpan, outsidePadding } = sizes;

  const u = x * nx + y * ny + z * nz;
  const along = x * dx + y * dy + z * dz;
  const uW = u + wobbleShift(noise, along, familyOff, wobbleInvScale, wobbleAmp);
  const cell = Math.round(uW * invSpacing);
  const lineJitter = (noise.noise(cell * 1.19 + familyOff, cell * 0.71 + 2.4, cell * 1.37) - 0.5) * lineJitterScale;
  const dist = Math.abs(uW - cell * spacing - lineJitter);

  const du = uW - cell * spacing;
  const lx = x - nx * du;
  const ly = y - ny * du;
  const lz = z - nz * du;

  const t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
  let width: number;
  if (secondFamily) {
    if (t < crossStart) return outsidePadding + dist;
    width = minWidth + (t - crossStart) * crossInv * widthSpan;
  } else {
    width = minWidth + t * widthSpan;
  }
  if (width <= 0) return outsidePadding + dist;

  const pressure = 0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18;
  return dist - width * pressure;
};

/** Cross-hatch: union of two plane families. */
export const sampleCrosshatchSdf = (
  ctx: CrosshatchFillCtx,
  x: number,
  y: number,
  z: number
): number => {
  const { state, sizes, plane1, plane2, crossStart, crossInv, hardMin } = ctx;
  const p1 = plane1;
  const sdf1 = hatchPlaneSdfCore(
    state,
    sizes,
    p1.nx,
    p1.ny,
    p1.nz,
    p1.dx,
    p1.dy,
    p1.dz,
    p1.familyOff,
    x,
    y,
    z,
    false,
    crossStart,
    crossInv
  );
  const p2 = plane2;
  const sdf2 = hatchPlaneSdfCore(
    state,
    sizes,
    p2.nx,
    p2.ny,
    p2.nz,
    p2.dx,
    p2.dy,
    p2.dz,
    p2.familyOff,
    x,
    y,
    z,
    true,
    crossStart,
    crossInv
  );
  if (hardMin) return sdf1 < sdf2 ? sdf1 : sdf2;
  return sminExp(sdf1, sdf2, sizes.mergeK);
};

/** Parallel lines: nearest line plus neighbours merged with smooth-min. */
export const sampleParallelHatchSdf = (ctx: ParallelFillCtx, x: number, y: number, z: number): number => {
  const { state, sizes, plane, hardMin } = ctx;
  const { noise, wobbleAmp, wobbleInvScale, invScale, widthToneMode, invNorm2, octaves, persistence } = state;
  const { invSpacing, spacing, lineJitterScale, minWidth, widthSpan, outsidePadding, mergeK } = sizes;
  const { nx, ny, nz, dx, dy, dz, familyOff } = plane;

  const u = x * nx + y * ny + z * nz;
  const along = x * dx + y * dy + z * dz;
  const uW = u + wobbleShift(noise, along, familyOff, wobbleInvScale, wobbleAmp);
  const cell = Math.round(uW * invSpacing);
  const cellSpacing = cell * spacing;

  let lineJitter = (noise.noise(cell * 1.19 + familyOff, cell * 0.71 + 2.4, cell * 1.37) - 0.5) * lineJitterScale;
  let dist = Math.abs(uW - cellSpacing - lineJitter);
  let du = uW - cellSpacing;
  let lx = x - nx * du;
  let ly = y - ny * du;
  let lz = z - nz * du;
  let t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
  let width = minWidth + t * widthSpan;
  let sdf0: number;
  if (width <= 0) sdf0 = outsidePadding + dist;
  else sdf0 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

  const cell1 = cell - 1;
  const cell1Spacing = cell1 * spacing;
  lineJitter = (noise.noise(cell1 * 1.19 + familyOff, cell1 * 0.71 + 2.4, cell1 * 1.37) - 0.5) * lineJitterScale;
  dist = Math.abs(uW - cell1Spacing - lineJitter);
  du = uW - cell1Spacing;
  lx = x - nx * du;
  ly = y - ny * du;
  lz = z - nz * du;
  t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
  width = minWidth + t * widthSpan;
  let sdf1: number;
  if (width <= 0) sdf1 = outsidePadding + dist;
  else sdf1 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

  const cell2 = cell + 1;
  const cell2Spacing = cell2 * spacing;
  lineJitter = (noise.noise(cell2 * 1.19 + familyOff, cell2 * 0.71 + 2.4, cell2 * 1.37) - 0.5) * lineJitterScale;
  dist = Math.abs(uW - cell2Spacing - lineJitter);
  du = uW - cell2Spacing;
  lx = x - nx * du;
  ly = y - ny * du;
  lz = z - nz * du;
  t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
  width = minWidth + t * widthSpan;
  let sdf2: number;
  if (width <= 0) sdf2 = outsidePadding + dist;
  else sdf2 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

  if (hardMin) {
    let m = sdf0;
    if (sdf1 < m) m = sdf1;
    if (sdf2 < m) m = sdf2;
    return m;
  }
  return sminExp(sminExp(sdf0, sdf1, mergeK), sdf2, mergeK);
};

/** Fill cross-hatch volume; inlines SDF eval in the grid loop. */
export const fillCrosshatchVolume = (
  ctx: CrosshatchFillCtx,
  grid: GridSpec,
  out: Float32Array,
  invertForMc: boolean
): void => {
  out.fill(OUTSIDE_FIELD);

  const { state, sizes, plane1, plane2, crossStart, crossInv, hardMin } = ctx;
  const mergeK = sizes.mergeK;
  const p1 = plane1;
  const p2 = plane2;
  const { nx, ny, nz, x0, y0, z0, sx, sy, sz } = grid;
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
        const sdf1 = hatchPlaneSdfCore(
          state,
          sizes,
          p1.nx,
          p1.ny,
          p1.nz,
          p1.dx,
          p1.dy,
          p1.dz,
          p1.familyOff,
          x,
          y,
          z,
          false,
          crossStart,
          crossInv
        );
        const sdf2 = hatchPlaneSdfCore(
          state,
          sizes,
          p2.nx,
          p2.ny,
          p2.nz,
          p2.dx,
          p2.dy,
          p2.dz,
          p2.familyOff,
          x,
          y,
          z,
          true,
          crossStart,
          crossInv
        );
        const v = hardMin ? (sdf1 < sdf2 ? sdf1 : sdf2) : sminExp(sdf1, sdf2, mergeK);
        out[idx++] = neg ? -v : v;
        x += sx;
      }
    }
  }
};

/** Fill parallel-line volume; inlines SDF eval in the grid loop. */
export const fillParallelVolume = (
  ctx: ParallelFillCtx,
  grid: GridSpec,
  out: Float32Array,
  invertForMc: boolean
): void => {
  out.fill(OUTSIDE_FIELD);

  const { state, sizes, plane, hardMin } = ctx;
  const { noise, wobbleAmp, wobbleInvScale, invScale, widthToneMode, invNorm2, octaves, persistence } = state;
  const { invSpacing, spacing, lineJitterScale, minWidth, widthSpan, outsidePadding, mergeK } = sizes;
  const { nx, ny, nz, dx, dy, dz, familyOff } = plane;
  const { nx: gnx, ny: gny, nz: gnz, x0, y0, z0, sx, sy, sz } = grid;
  const xEnd = gnx - 1;
  const yEnd = gny - 1;
  const zEnd = gnz - 1;
  const neg = invertForMc;

  for (let k = 1; k < zEnd; k++) {
    const z = z0 + k * sz;
    let rowBase = k * gny * gnx;
    for (let j = 1; j < yEnd; j++) {
      rowBase += gnx;
      const y = y0 + j * sy;
      let x = x0 + sx;
      let idx = rowBase + 1;
      for (let i = 1; i < xEnd; i++) {
        const u = x * nx + y * ny + z * nz;
        const along = x * dx + y * dy + z * dz;
        const uW = u + wobbleShift(noise, along, familyOff, wobbleInvScale, wobbleAmp);
        const cell = Math.round(uW * invSpacing);
        const cellSpacing = cell * spacing;

        let lineJitter = (noise.noise(cell * 1.19 + familyOff, cell * 0.71 + 2.4, cell * 1.37) - 0.5) * lineJitterScale;
        let dist = Math.abs(uW - cellSpacing - lineJitter);
        let du = uW - cellSpacing;
        let lx = x - nx * du;
        let ly = y - ny * du;
        let lz = z - nz * du;
        let t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
        let width = minWidth + t * widthSpan;
        let sdf0: number;
        if (width <= 0) sdf0 = outsidePadding + dist;
        else sdf0 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

        const cell1 = cell - 1;
        const cell1Spacing = cell1 * spacing;
        lineJitter = (noise.noise(cell1 * 1.19 + familyOff, cell1 * 0.71 + 2.4, cell1 * 1.37) - 0.5) * lineJitterScale;
        dist = Math.abs(uW - cell1Spacing - lineJitter);
        du = uW - cell1Spacing;
        lx = x - nx * du;
        ly = y - ny * du;
        lz = z - nz * du;
        t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
        width = minWidth + t * widthSpan;
        let sdf1: number;
        if (width <= 0) sdf1 = outsidePadding + dist;
        else sdf1 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

        const cell2 = cell + 1;
        const cell2Spacing = cell2 * spacing;
        lineJitter = (noise.noise(cell2 * 1.19 + familyOff, cell2 * 0.71 + 2.4, cell2 * 1.37) - 0.5) * lineJitterScale;
        dist = Math.abs(uW - cell2Spacing - lineJitter);
        du = uW - cell2Spacing;
        lx = x - nx * du;
        ly = y - ny * du;
        lz = z - nz * du;
        t = widthTone(noise, lx, ly, lz, invScale, widthToneMode, invNorm2, octaves, persistence);
        width = minWidth + t * widthSpan;
        let sdf2: number;
        if (width <= 0) sdf2 = outsidePadding + dist;
        else sdf2 = dist - width * (0.9 + noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18);

        let v: number;
        if (hardMin) {
          v = sdf0;
          if (sdf1 < v) v = sdf1;
          if (sdf2 < v) v = sdf2;
        } else {
          v = sminExp(sminExp(sdf0, sdf1, mergeK), sdf2, mergeK);
        }
        out[idx++] = neg ? -v : v;
        x += sx;
      }
    }
  }
};

export const crossStartInv = (crossStartPct: number): number => {
  const frac = crossStartPct / 100;
  return frac >= 1 ? 0 : 1 / (1 - frac);
};

export const buildHatchNoiseState = (
  noise: HalftoneNoiseSource,
  form: FormObject,
  wobbleAmpScale: number
): HatchLineNoiseState => {
  const octaves = form.octaves;
  const persistence = form.persistence;
  let widthToneMode: HatchLineNoiseState['widthToneMode'] = 'fbm';
  if (octaves <= 1) widthToneMode = 'one';
  else if (octaves === 2) widthToneMode = 'two';

  return {
    noise,
    invScale: 1 / form.scale,
    octaves,
    persistence,
    wobbleAmp: form.hatchSpacing * wobbleAmpScale,
    wobbleInvScale: 1 / form.scale / 3.5,
    widthToneMode,
    invNorm2: 1 / (1 + persistence)
  };
};

export const buildCrosshatchFillCtx = (
  state: HatchLineNoiseState,
  sizes: HatchLineSizes,
  plane1: HatchPlaneCoeffs,
  plane2: HatchPlaneCoeffs,
  crossStartPct: number
): CrosshatchFillCtx => {
  const crossStart = crossStartPct / 100;
  return {
    state,
    sizes,
    plane1,
    plane2,
    crossStart,
    crossInv: crossStartInv(crossStartPct),
    hardMin: sizes.mergeK <= 0
  };
};

export const buildParallelFillCtx = (
  state: HatchLineNoiseState,
  sizes: HatchLineSizes,
  plane: HatchPlaneCoeffs
): ParallelFillCtx => ({
  state,
  sizes,
  plane,
  hardMin: sizes.mergeK <= 0
});
