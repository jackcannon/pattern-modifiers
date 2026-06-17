import { marchingCubes } from '../marchingCubes';

import type { FormObject } from '../../form/schema';
import { PARALLEL_FIELD_KEYS } from './fieldKeys';
import { createHalftoneNoiseSource } from './halftoneNoise';
import {
  buildHatchNoiseState,
  buildHatchPlaneCoeffs,
  buildParallelFillCtx,
  fillParallelVolume,
  HATCH_LINE_ISO,
  hatchClipMaxCell,
  hatchLineBounds,
  hatchLineSizesFromForm,
  makeHatchGridSpec,
  sampleParallelHatchSdf,
  type ParallelFillCtx
} from './hatchLineField';
import { type ClipFieldSpec, type PatternDefinition, type PatternSampleContext } from './types';

import type { PatternGridContext } from '../patternField';

interface ParallelContext extends PatternSampleContext, ParallelFillCtx {}

const buildContext = (form: FormObject): ParallelContext => {
  const noise = createHalftoneNoiseSource(form.halftoneNoise, form.seed);
  const sizes = hatchLineSizesFromForm(form);
  const plane = buildHatchPlaneCoeffs(-1, 1, 0.32, 0);
  const state = buildHatchNoiseState(noise, form, 0.1);

  return {
    ...buildParallelFillCtx(state, sizes, plane),
    state,
    sizes,
    plane
  };
};

const buildParallelPatternGrid = (form: FormObject, resolution: number): PatternGridContext => {
  const ctx = buildContext(form);
  const grid = makeHatchGridSpec(form, resolution);
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  fillParallelVolume(ctx, grid, field, false);

  return {
    field,
    grid,
    iso: HATCH_LINE_ISO,
    bounds: hatchLineBounds(form),
    histogram: new Uint32Array(0),
    sampleCount: 0
  };
};

const createParallelClipField = (form: FormObject): ClipFieldSpec => {
  const ctx = buildContext(form);
  const maxWidth = (form.hatchSpacing / 100) * form.hatchMaxWidthPct;

  return {
    sample: (x, y, z) => sampleParallelHatchSdf(ctx, x, y, z),
    iso: HATCH_LINE_ISO,
    solidHigh: false,
    bounds: hatchLineBounds(form),
    maxCellSize: hatchClipMaxCell(form.hatchSpacing, maxWidth)
  };
};

export const parallelPattern: PatternDefinition = {
  type: 'parallel',
  label: 'Parallel Lines',
  description:
    'Parallel hatch lines through the volume. Line weight follows a noise field like a newspaper line screen.',
  category: 'shading',
  formSections: [
    {
      title: 'Parallel Lines',
      fields: ['halftoneNoise', 'hatchSpacing', 'hatchMinWidthPct', 'hatchMaxWidthPct', 'mergeSmoothnessPct']
    },
    { title: 'Noise', fields: ['scale', 'seed', 'octaves', 'persistence'] }
  ],
  fieldKeys: [...PARALLEL_FIELD_KEYS],
  fixedIso: HATCH_LINE_ISO,
  fieldDefaults: {
    halftoneNoise: 'perlin',
    hatchSpacing: 5,
    hatchMinWidthPct: 1,
    hatchMaxWidthPct: 40,
    mergeSmoothnessPct: 8,
    scale: 70,
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
      form.mergeSmoothnessPct
    ];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    return sampleParallelHatchSdf(context as ParallelContext, x, y, z);
  },
  buildPatternGrid(form, resolution) {
    return buildParallelPatternGrid(form, resolution);
  },
  buildGeometry(form, resolution) {
    const ctx = buildContext(form);
    const grid = makeHatchGridSpec(form, resolution);
    const mcField = new Float32Array(grid.nx * grid.ny * grid.nz);
    fillParallelVolume(ctx, grid, mcField, true);
    return marchingCubes(mcField, grid, HATCH_LINE_ISO, true);
  },
  createClipField(form) {
    return createParallelClipField(form);
  }
};
