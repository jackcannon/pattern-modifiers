import { GridSpec, marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { CROSSHATCH_FIELD_KEYS } from './fieldKeys';
import { createHalftoneNoiseSource } from './halftoneNoise';
import { OUTSIDE_FIELD, type ClipFieldSpec, type PatternDefinition, type PatternSampleContext } from './types';

import type { PatternGridContext } from '../patternField';

/** Iso level for the stroke union SDF. Values <= this are solid. */
const CROSSHATCH_ISO = 0;

interface HatchPlane {
  nx: number;
  ny: number;
  nz: number;
  /** Stroke direction (unit, in the hatch plane) */
  dx: number;
  dy: number;
  dz: number;
  familyOff: number;
}

interface CrosshatchContext extends PatternSampleContext {
  noise: ReturnType<typeof createHalftoneNoiseSource>;
  invScale: number;
  octaves: number;
  persistence: number;
  spacing: number;
  invSpacing: number;
  minWidth: number;
  widthSpan: number;
  crossStart: number;
  mergeK: number;
  hardMin: boolean;
  wobbleAmp: number;
  wobbleInvScale: number;
  plane1: HatchPlane;
  plane2: HatchPlane;
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

const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return [0, 1, 0];
  return [x / len, y / len, z / len];
};

const cross3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx
];

const crosshatchSizesFromForm = (form: FormObject) => {
  const spacing = form.hatchSpacing;
  const inv = spacing / 100;
  return {
    spacing,
    minWidth: inv * form.hatchMinWidthPct,
    maxWidth: inv * form.hatchMaxWidthPct,
    mergeK: inv * form.mergeSmoothnessPct,
    crossStart: form.hatchCrossStart / 100
  };
};

const strokeWidth = (
  t: number,
  minWidth: number,
  widthSpan: number,
  crossStart: number,
  isSecondFamily: boolean
): number => {
  if (isSecondFamily) {
    if (t < crossStart) return 0;
    const crossT = (t - crossStart) / (1 - crossStart);
    return minWidth + crossT * widthSpan;
  }
  return minWidth + t * widthSpan;
};

const buildHatchPlane = (nx: number, ny: number, nz: number, familyOff: number): HatchPlane => {
  const [nnx, nny, nnz] = normalize3(nx, ny, nz);
  let [dx, dy, dz] = cross3(nnx, nny, nnz, 0, 0, 1);
  let len = Math.hypot(dx, dy, dz);
  if (len < 0.12) {
    [dx, dy, dz] = cross3(nnx, nny, nnz, 0, 1, 0);
    len = Math.hypot(dx, dy, dz);
  }
  return {
    nx: nnx,
    ny: nny,
    nz: nnz,
    dx: dx / len,
    dy: dy / len,
    dz: dz / len,
    familyOff
  };
};

const hatchPlaneSdf = (
  ctx: CrosshatchContext,
  x: number,
  y: number,
  z: number,
  plane: HatchPlane,
  isSecondFamily: boolean
): number => {
  const { nx, ny, nz, dx, dy, dz, familyOff } = plane;
  const u = x * nx + y * ny + z * nz;
  const along = x * dx + y * dy + z * dz;

  const wobble =
    (ctx.noise.fbm(
      along * ctx.wobbleInvScale + familyOff,
      along * 0.27 + familyOff + 1.3,
      along * 0.13 + familyOff + 4.1,
      ctx.wobbleInvScale,
      2,
      0.5
    ) -
      0.5) *
    2 *
    ctx.wobbleAmp;
  const uW = u + wobble;

  const cell = Math.round(uW * ctx.invSpacing);
  const lineJitter =
    (ctx.noise.noise(cell * 1.19 + familyOff, cell * 0.71 + 2.4, cell * 1.37) - 0.5) * ctx.spacing * 0.12;
  const dist = Math.abs(uW - cell * ctx.spacing - lineJitter);

  const du = uW - cell * ctx.spacing;
  const lx = x - nx * du;
  const ly = y - ny * du;
  const lz = z - nz * du;

  const t = ctx.noise.fbm(lx, ly, lz, ctx.invScale, ctx.octaves, ctx.persistence);
  const width = strokeWidth(t, ctx.minWidth, ctx.widthSpan, ctx.crossStart, isSecondFamily);
  if (width <= 0) return ctx.minWidth + ctx.mergeK + dist;

  const pressure = 0.9 + ctx.noise.noise(along * 0.15 + familyOff, lx * 0.12, ly * 0.12) * 0.18;
  return dist - width * pressure;
};

const sdfAt = (ctx: CrosshatchContext, x: number, y: number, z: number): number => {
  const sdf1 = hatchPlaneSdf(ctx, x, y, z, ctx.plane1, false);
  const sdf2 = hatchPlaneSdf(ctx, x, y, z, ctx.plane2, true);
  if (ctx.hardMin) return sdf1 < sdf2 ? sdf1 : sdf2;
  return sminExp(sdf1, sdf2, ctx.mergeK);
};

const buildContext = (form: FormObject): CrosshatchContext => {
  const noise = createHalftoneNoiseSource(form.halftoneNoise, form.seed);
  const { spacing, minWidth, maxWidth, mergeK, crossStart } = crosshatchSizesFromForm(form);
  const mergeKValue = mergeK;

  const ctx: CrosshatchContext = {
    noise,
    invScale: 1 / form.scale,
    octaves: form.octaves,
    persistence: form.persistence,
    spacing,
    invSpacing: 1 / spacing,
    minWidth,
    widthSpan: maxWidth - minWidth,
    crossStart,
    mergeK: mergeKValue,
    hardMin: mergeKValue <= 0,
    wobbleAmp: spacing * 0.12,
    wobbleInvScale: 1 / form.scale / 3.5,
    plane1: buildHatchPlane(-1, 1, 0.32, 0),
    plane2: buildHatchPlane(1, 1, 0.32, 17.9),
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

const fillCrosshatchVolume = (
  ctx: CrosshatchContext,
  grid: GridSpec,
  out: Float32Array,
  invertForMc: boolean
): void => {
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

const crosshatchBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

const buildCrosshatchPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = buildContext(form);
  const grid = makeGridSpec(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillCrosshatchVolume(ctx, grid, field, false);

  return {
    field,
    grid,
    iso: CROSSHATCH_ISO,
    bounds: crosshatchBounds(form),
    histogram: new Uint32Array(0),
    sampleCount: 0
  };
};

const createCrosshatchClipField = (form: FormObject): ClipFieldSpec => {
  const ctx = buildContext(form);
  const { spacing, maxWidth } = crosshatchSizesFromForm(form);
  const maxCell = Math.min(spacing * 0.38, maxWidth * 0.65, 1.6);

  return {
    sample: (x, y, z) => sdfAt(ctx, x, y, z),
    iso: CROSSHATCH_ISO,
    solidHigh: false,
    bounds: crosshatchBounds(form),
    maxCellSize: maxCell
  };
};

export const crosshatchPattern: PatternDefinition = {
  type: 'crosshatch',
  label: 'Cross-hatch',
  description:
    'Two sets of diagonal hatch lines crossing through the volume. Stroke weight and cross-hatch density follow a noise field.',
  category: 'shading',
  formSections: [
    {
      title: 'Cross-hatch',
      fields: [
        'halftoneNoise',
        'hatchSpacing',
        'hatchMinWidthPct',
        'hatchMaxWidthPct',
        'hatchCrossStart',
        'mergeSmoothnessPct'
      ]
    },
    { title: 'Noise', fields: ['scale', 'seed', 'octaves', 'persistence'] }
  ],
  fieldKeys: [...CROSSHATCH_FIELD_KEYS],
  fixedIso: CROSSHATCH_ISO,
  fieldDefaults: {
    halftoneNoise: 'perlin',
    hatchSpacing: 6,
    hatchMinWidthPct: 1,
    hatchMaxWidthPct: 40,
    hatchCrossStart: 35,
    mergeSmoothnessPct: 1,
    scale: 65,
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
      form.hatchSpacing,
      form.hatchMinWidthPct,
      form.hatchMaxWidthPct,
      form.hatchCrossStart,
      form.mergeSmoothnessPct
    ];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    return (context as CrosshatchContext).sample(x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildCrosshatchPatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const ctx = buildContext(form);
    const grid = makeGridSpec(form, resolution);
    const mcField = new Float32Array(grid.nx * grid.ny * grid.nz);
    fillCrosshatchVolume(ctx, grid, mcField, true);
    return marchingCubes(mcField, grid, CROSSHATCH_ISO, true);
  },
  createClipField(form) {
    return createCrosshatchClipField(form);
  }
};
