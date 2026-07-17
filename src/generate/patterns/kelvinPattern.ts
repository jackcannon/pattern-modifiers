import { GridSpec, marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { KELVIN_FIELD_KEYS } from './fieldKeys';
import { OUTSIDE_FIELD, type ClipFieldSpec, type PatternDefinition, type PatternSampleContext } from './types';

import type { PatternGridContext } from '../patternField';

/** Iso level for the wall SDF. Values <= this are solid. */
const KELVIN_ISO = 0;

/** BCC neighbourhood radius in lattice steps (3×3×3 × two sub-lattices). */
const NEIGHBOR_RADIUS = 1;

/**
 * Single 45° tilt around Y so model faces do not cut the lattice on axis-aligned planes, without
 * the irregular look of compound rotations.
 */
const KELVIN_TILT_Y = Math.PI / 4;

interface KelvinContext extends PatternSampleContext {
  spacing: number;
  halfSpacing: number;
  invSpacing: number;
  toSize: number;
  wallHalf: number;
  originX: number;
  originY: number;
  originZ: number;
  tiltCosY: number;
  tiltSinY: number;
  sample: (x: number, y: number, z: number) => number;
}

/**
 * Truncated octahedron SDF (Inigo Quilez). s sets square-face half-width and hex-face offset;
 * for a BCC Voronoi cell use s = spacing / 2.
 */
const truncatedOctahedronSdf = (px: number, py: number, pz: number, s: number): number => {
  const x = Math.abs(px);
  const y = Math.abs(py);
  const z = Math.abs(pz);
  const dHex = x + y + z - 1.5 * s;
  const dSq = Math.max(x - s, Math.max(y - s, z - s));
  return Math.max(dHex, dSq);
};

/** Solid wall shell on one truncated octahedron cell. */
const cellWallSdf = (px: number, py: number, pz: number, toSize: number, wallHalf: number): number => {
  return Math.abs(truncatedOctahedronSdf(px, py, pz, toSize)) - wallHalf;
};

const kelvinSizesFromForm = (form: FormObject) => {
  const spacing = form.dotSpacing;
  const phase = form.zOffsetPct / 100;
  return {
    spacing,
    halfSpacing: spacing * 0.5,
    toSize: spacing * 0.5,
    wallHalf: form.lineThickness * 0.5,
    originX: phase * spacing * (1 / 3),
    originY: phase * spacing * (2 / 3),
    originZ: phase * spacing
  };
};

/** Map printer-space coordinates into the tilted, offset lattice frame. */
const worldToLattice = (ctx: KelvinContext, x: number, y: number, z: number): [number, number, number] => {
  const { tiltCosY, tiltSinY, originX, originY, originZ } = ctx;

  const lx = tiltCosY * x + tiltSinY * z - originX;
  const ly = y - originY;
  const lz = -tiltSinY * x + tiltCosY * z - originZ;

  return [lx, ly, lz];
};

/**
 * Union of wall shells on all nearby BCC sites. Using only the nearest site leaves gaps along
 * shared faces when the Voronoi owner switches, which reads as dashed diagonal struts on a grid.
 */
const sdfAt = (ctx: KelvinContext, x: number, y: number, z: number): number => {
  const [lx, ly, lz] = worldToLattice(ctx, x, y, z);
  const { spacing, halfSpacing, invSpacing, toSize, wallHalf } = ctx;

  const ix = Math.round(lx * invSpacing);
  const iy = Math.round(ly * invSpacing);
  const iz = Math.round(lz * invSpacing);

  let sdf = Infinity;

  for (let di = -NEIGHBOR_RADIUS; di <= NEIGHBOR_RADIUS; di++) {
    const axBase = (ix + di) * spacing;
    for (let dj = -NEIGHBOR_RADIUS; dj <= NEIGHBOR_RADIUS; dj++) {
      const ayBase = (iy + dj) * spacing;
      for (let dk = -NEIGHBOR_RADIUS; dk <= NEIGHBOR_RADIUS; dk++) {
        const azBase = (iz + dk) * spacing;

        let d = cellWallSdf(lx - axBase, ly - ayBase, lz - azBase, toSize, wallHalf);
        if (d < sdf) sdf = d;

        d = cellWallSdf(
          lx - axBase - halfSpacing,
          ly - ayBase - halfSpacing,
          lz - azBase - halfSpacing,
          toSize,
          wallHalf
        );
        if (d < sdf) sdf = d;
      }
    }
  }

  return sdf;
};

const buildContext = (form: FormObject): KelvinContext => {
  const { spacing, halfSpacing, toSize, wallHalf, originX, originY, originZ } = kelvinSizesFromForm(form);

  const ctx: KelvinContext = {
    spacing,
    halfSpacing,
    invSpacing: 1 / spacing,
    toSize,
    wallHalf,
    originX,
    originY,
    originZ,
    tiltCosY: Math.cos(KELVIN_TILT_Y),
    tiltSinY: Math.sin(KELVIN_TILT_Y),
    sample: () => 0
  };
  ctx.sample = (x, y, z) => sdfAt(ctx, x, y, z);
  return ctx;
};

/** Hard cap on grid samples so preview/export cannot OOM the browser. */
const MAX_GRID_SAMPLES = 4_000_000;

const gridSampleCount = (cellsX: number, cellsY: number, cellsZ: number): number => {
  return (cellsX + 3) * (cellsY + 3) * (cellsZ + 3);
};

const cellsForResolution = (form: FormObject, res: number) => {
  const { width, height, depth } = form;
  const longest = Math.max(width, depth, height);
  return {
    cellsX: Math.max(2, Math.round((width / longest) * res)),
    cellsY: Math.max(2, Math.round((depth / longest) * res)),
    cellsZ: Math.max(2, Math.round((height / longest) * res))
  };
};

/** Shrink resolution until the marching-cubes grid stays under {@link MAX_GRID_SAMPLES}. */
const resolveKelvinResolution = (form: FormObject, resolution: number): number => {
  let res = resolution;

  for (;;) {
    const { cellsX, cellsY, cellsZ } = cellsForResolution(form, res);
    if (gridSampleCount(cellsX, cellsY, cellsZ) <= MAX_GRID_SAMPLES) return res;
    if (res <= 24) return 24;
    res = Math.max(24, Math.floor(res * 0.9));
  }
};

const makeGridSpec = (form: FormObject, resolution: number): GridSpec => {
  const { width, height, depth } = form;
  const res = resolveKelvinResolution(form, resolution);
  const { cellsX, cellsY, cellsZ } = cellsForResolution(form, res);

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

const kelvinBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

const fillKelvinVolume = (
  ctx: KelvinContext,
  grid: GridSpec,
  out: Float32Array,
  invertForMc: boolean
): void => {
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
        const v = sdfAt(ctx, x, y, z);
        out[idx++] = neg ? -v : v;
        x += sx;
      }
    }
  }
};

const buildKelvinPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = buildContext(form);
  const grid = makeGridSpec(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillKelvinVolume(ctx, grid, field, false);

  return {
    field,
    grid,
    iso: KELVIN_ISO,
    bounds: kelvinBounds(form),
    histogram: new Uint32Array(0),
    sampleCount: 0
  };
};

const createKelvinClipField = (form: FormObject, resolution: number): ClipFieldSpec => {
  const ctx = buildContext(form);
  const longest = Math.max(form.width, form.depth, form.height);
  const cell = longest / resolution;
  const maxCell = Math.max(0.25, Math.min(cell, form.lineThickness * 0.4));

  return {
    sample: (x, y, z) => ctx.sample(x, y, z),
    iso: KELVIN_ISO,
    solidHigh: false,
    bounds: kelvinBounds(form),
    maxCellSize: maxCell,
    thinShell: true,
    shellThickness: form.lineThickness
  };
};

export const kelvinPattern: PatternDefinition = {
  type: 'kelvin',
  label: 'Kelvin foam',
  description:
    'Uniform truncated octahedron cells on a body-centred cubic lattice. Solid region is the shared cell walls.',
  category: 'other',
  formSections: [{ title: 'Kelvin foam', fields: ['dotSpacing', 'lineThickness', 'zOffsetPct'] }],
  fieldKeys: [...KELVIN_FIELD_KEYS],
  fixedIso: KELVIN_ISO,
  fieldDefaults: {
    dotSpacing: 10,
    lineThickness: 1.2,
    zOffsetPct: 50,
    demoResolution: 80
  },
  cacheKeyParts(form) {
    return [form.dotSpacing, form.lineThickness, form.zOffsetPct];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    return (context as KelvinContext).sample(x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildKelvinPatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const ctx = buildContext(form);
    const grid = makeGridSpec(form, resolution);
    const mcField = new Float32Array(grid.nx * grid.ny * grid.nz);
    fillKelvinVolume(ctx, grid, mcField, true);
    return marchingCubes(mcField, grid, KELVIN_ISO, true);
  },
  createClipField(form, resolution) {
    return createKelvinClipField(form, resolution);
  }
};
