import { SimplexNoise3D } from '../simplex';
import { voronoiF2MinusF1 } from '../worley';

import type { FormObject } from '../../form/schema';
import { CELLULAR_FIELD_KEYS, KINTSUGI_FIELD_KEYS } from './fieldKeys';
import type { ClipFieldSpec, PatternDefinition, PatternSampleContext } from './types';

interface KintsugiContext extends PatternSampleContext {
  noise: SimplexNoise3D;
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
const crackValue = (
  noise: SimplexNoise3D,
  seed: number,
  x: number,
  y: number,
  z: number,
  cellSize: number,
  crackWidth: number,
  jag: number
): number => {
  let wx = x;
  let wy = y;
  let wz = z;

  if (jag > 0) {
    // Warp at a fraction of the cell size so the distortion adds sub-cell wander to the crack lines rather
    // than displacing whole cells, which is what gives the hand-cracked, irregular look of the references.
    const fw = cellSize * 0.35;
    const nx = x / fw;
    const ny = y / fw;
    const nz = z / fw;
    wx = x + jag * noise.noise(nx + WARP_OFF_X, ny, nz);
    wy = y + jag * noise.noise(nx, ny + WARP_OFF_Y, nz);
    wz = z + jag * noise.noise(nx, ny, nz + WARP_OFF_Z);
  }

  // voronoiF2MinusF1 returns min(1, (F2 - F1) * 2) in cell-normalised units; near a boundary it is ~0 and grows
  // with distance from it. Converting that to a mm distance and dividing by Crack Width makes CRACK_ISO = 0.5
  // fall exactly at the requested half-width, so Crack Width reads as a real thickness in millimetres.
  const edge = voronoiF2MinusF1(seed, wx / cellSize, wy / cellSize, wz / cellSize);
  return Math.min(1, (edge * cellSize) / (4 * crackWidth));
};

const createKintsugiClipField = (form: FormObject, _resolution: number): ClipFieldSpec => {
  const noise = new SimplexNoise3D(form.seed);
  const { scale: cellSize, crackWidth, crackJaggedness: jag, seed } = form;

  return {
    sample: (x, y, z) => crackValue(noise, seed, x, y, z, cellSize, crackWidth, jag),
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
    maxCellSize: Math.max(0.6, Math.min(crackWidth, 4))
  };
};

export const kintsugiPattern: PatternDefinition = {
  type: 'kintsugi',
  label: 'Kintsugi',
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
    return { noise: new SimplexNoise3D(form.seed) };
  },
  sample(form, x, y, z, context) {
    const { noise } = context as KintsugiContext;
    return crackValue(noise, form.seed, x, y, z, form.scale, form.crackWidth, form.crackJaggedness);
  },
  createClipField(form, resolution) {
    return createKintsugiClipField(form, resolution);
  }
};
