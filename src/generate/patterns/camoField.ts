import { PerlinNoise3D } from '../perlin';
import { SimplexNoise3D } from '../simplex';

import type { FormObject } from '../../form/schema';
import type { PatternBounds, PatternSampleContext } from './types';

export interface CamoFieldOptions {
  seed: number;
  /** Wavelength of the patches (mm) */
  scale: number;
  /** Elongation along the oblique stretch axis. 1 means no stretch */
  stretch: number;
  waveCount?: number;
  /** Edge warp amplitude, in units of {@link scale} */
  warpAmp?: number;
  /** Edge warp frequency, in cycles per {@link scale} */
  warpFreq?: number;
  /** When set, wave directions fall in a cone around this unit axis instead of all directions */
  waveAxis?: readonly [number, number, number];
  /** Half-angle of the {@link waveAxis} cone (radians) */
  waveSpread?: number;
  /**
   * Random spread of each wave's frequency, as a fraction (0.2 gives ±20%). With a narrow {@link waveSpread},
   * one shared wavelength lets the wave sum cancel along whole lines, where stripes jump by half a period
   */
  wavelengthJitter?: number;
  /**
   * Warp with Perlin noise instead of Simplex. This Simplex has small jumps (kernel radius 0.6) that a
   * strong warp turns into visible tears, so use this with large {@link warpAmp} values
   */
  smoothWarp?: boolean;
}

export interface CamoFieldContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  warpNoise: SimplexNoise3D | PerlinNoise3D;
  invS: number;
  squash: number;
  waveCount: number;
  waveNorm: number;
  waveDirs: Float64Array;
  wavePhases: Float64Array;
  warpAmp: number;
  warpFreq: number;
}

// Patches are drawn out along this oblique axis. It has a component on every model axis, so all six
// faces show elongated patches instead of the top face showing round blobs.
const DIR_LEN = Math.hypot(1, 0.55, 0.45);
const DIR_X = 1 / DIR_LEN;
const DIR_Y = 0.55 / DIR_LEN;
const DIR_Z = 0.45 / DIR_LEN;

// The base field is a sum of plane waves that share one wavelength but point in random directions.
// Unlike FBM, this gives patches of an even size with no large empty areas or tiny specks.
const WAVE_FREQ = Math.PI * 2;
// A wave that points almost straight through a face shows on that face as one large flat region, so no
// direction may have a squared component above this on any model axis.
const WAVE_MAX_AXIS_SQ = 0.6;

const DEFAULT_WAVE_COUNT = 16;
const DEFAULT_WARP_AMP = 0.4;
const DEFAULT_WARP_FREQ = 0.93;

export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const formBounds = (form: FormObject): PatternBounds => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

const ISO_SAMPLE_COUNT = 40000;

/**
 * Estimates the Threshold percentile iso of a field from a fixed random set of points in the model box.
 * Analytic demo clip fields need an iso but have no voxel histogram to read it from.
 *
 * @param {(x: number, y: number, z: number) => number} sample - field sampler (mm)
 * @param {PatternBounds} bounds - model box
 * @param {number} threshold - percentile (0 to 100) of samples at or below the iso
 * @returns {number} iso value
 */
export const percentileIso = (
  sample: (x: number, y: number, z: number) => number,
  bounds: PatternBounds,
  threshold: number
): number => {
  const rand = mulberry32(0x5eed);
  const values = new Float32Array(ISO_SAMPLE_COUNT);
  const sx = bounds.maxX - bounds.minX;
  const sy = bounds.maxY - bounds.minY;
  const sz = bounds.maxZ - bounds.minZ;
  for (let i = 0; i < ISO_SAMPLE_COUNT; i++) {
    values[i] = sample(bounds.minX + rand() * sx, bounds.minY + rand() * sy, bounds.minZ + rand() * sz);
  }
  values.sort();
  return values[Math.min(ISO_SAMPLE_COUNT - 1, Math.floor((ISO_SAMPLE_COUNT * threshold) / 100))];
};

/** Two unit vectors perpendicular to `axis` and each other, flattened as [ux, uy, uz, vx, vy, vz] */
const perpendicularBasis = (axis: readonly [number, number, number]): number[] => {
  const [ax, ay, az] = axis;
  const ref = Math.abs(ax) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ux = ay * ref[2] - az * ref[1];
  let uy = az * ref[0] - ax * ref[2];
  let uz = ax * ref[1] - ay * ref[0];
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  return [ux, uy, uz, ay * uz - az * uy, az * ux - ax * uz, ax * uy - ay * ux];
};

export const createCamoFieldContext = (opts: CamoFieldOptions): CamoFieldContext => {
  const waveCount = opts.waveCount ?? DEFAULT_WAVE_COUNT;
  const rand = mulberry32(opts.seed * 7919 + 13);
  const waveDirs = new Float64Array(waveCount * 3);
  const wavePhases = new Float64Array(waveCount);
  const axis = opts.waveAxis;
  const basis = axis ? perpendicularBasis(axis) : null;
  for (let i = 0; i < waveCount; i++) {
    let dx: number;
    let dy: number;
    let dz: number;
    if (axis && basis) {
      const tilt = (opts.waveSpread ?? 0) * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const ca = Math.cos(a) * st;
      const sa = Math.sin(a) * st;
      dx = axis[0] * ct + basis[0] * ca + basis[3] * sa;
      dy = axis[1] * ct + basis[1] * ca + basis[4] * sa;
      dz = axis[2] * ct + basis[2] * ca + basis[5] * sa;
    } else {
      do {
        dz = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - dz * dz);
        dx = r * Math.cos(a);
        dy = r * Math.sin(a);
      } while (Math.max(dx * dx, dy * dy, dz * dz) > WAVE_MAX_AXIS_SQ);
    }
    const freq = opts.wavelengthJitter ? WAVE_FREQ * (1 + opts.wavelengthJitter * (rand() * 2 - 1)) : WAVE_FREQ;
    waveDirs[i * 3] = dx * freq;
    waveDirs[i * 3 + 1] = dy * freq;
    waveDirs[i * 3 + 2] = dz * freq;
    wavePhases[i] = rand() * Math.PI * 2;
  }

  const noise = new SimplexNoise3D(opts.seed);
  return {
    noise,
    warpNoise: opts.smoothWarp ? new PerlinNoise3D(opts.seed) : noise,
    invS: 1 / opts.scale,
    squash: 1 - 1 / opts.stretch,
    waveCount,
    waveNorm: 0.25 / Math.sqrt(waveCount),
    waveDirs,
    wavePhases,
    warpAmp: opts.warpAmp ?? DEFAULT_WARP_AMP,
    warpFreq: opts.warpFreq ?? DEFAULT_WARP_FREQ
  };
};

/**
 * Even-sized camo patch field: stretched, edge-warped band-limited noise.
 *
 * @param {CamoFieldContext} c - context from {@link createCamoFieldContext}
 * @param {number} x - sample X (mm)
 * @param {number} y - sample Y (mm)
 * @param {number} z - sample Z (mm)
 * @returns {number} value in range [0, 1], centred on 0.5
 */
export const camoFieldValue = (c: CamoFieldContext, x: number, y: number, z: number): number => {
  const { warpNoise: noise, invS, squash, waveCount, waveNorm, waveDirs, wavePhases, warpAmp, warpFreq } = c;
  const along = (x * DIR_X + y * DIR_Y + z * DIR_Z) * squash;
  const nx = (x - along * DIR_X) * invS;
  const ny = (y - along * DIR_Y) * invS;
  const nz = (z - along * DIR_Z) * invS;

  const wx = nx * warpFreq;
  const wy = ny * warpFreq;
  const wz = nz * warpFreq;
  const px = nx + warpAmp * noise.noise(wx + 3.1, wy + 7.7, wz + 1.9);
  const py = ny + warpAmp * noise.noise(wx + 8.4, wy + 2.6, wz + 5.3);
  const pz = nz + warpAmp * noise.noise(wx + 4.8, wy + 9.2, wz + 6.1);

  let v = 0;
  for (let i = 0, j = 0; i < waveCount; i++, j += 3) {
    v += Math.cos(px * waveDirs[j] + py * waveDirs[j + 1] + pz * waveDirs[j + 2] + wavePhases[i]);
  }
  return Math.min(1, Math.max(0, 0.5 + v * waveNorm));
};
