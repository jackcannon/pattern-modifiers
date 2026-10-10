import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { TIGER_FIELD_KEYS } from './fieldKeys';
import { camoFieldValue, createCamoFieldContext, type CamoFieldContext } from './camoField';
import type { PatternDefinition } from './types';

interface TigerContext extends CamoFieldContext {
  across: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  modNoise: PerlinNoise3D;
  breakAmp: number;
  widthAmp: number;
}

// Camo patches are squashed along a normal into flat sheets, so faces cut them as thin parallel stripes.
// Stripe Angle tilts the normal away from Z: at 0° the side faces show level stripes and the top face shows
// broad blobs, and at about 55° all three face directions look the same. Stripe Direction turns it around Z
// from this base azimuth.
const BASE_AZIMUTH_DEG = 50;
// Stretch along the stripes, which gives long brush strokes with tapered ends.
const ALONG_STRETCH = 2.5;
const WARP_AMP = 0.3;
// Break-up and Width Variation add Perlin noise to the field. This moves the threshold up or down, so
// strokes break into dashes (fast noise) or get denser and sparser across the model (slow noise).
// Frequencies are in cycles per Feature Size.
const BREAK_FREQ = 0.9;
const WIDTH_FREQ = 0.2;

const createTigerContext = (form: FormObject): TigerContext => {
  const tilt = (form.tigerAngle * Math.PI) / 180;
  const az = ((BASE_AZIMUTH_DEG + form.tigerDirection) * Math.PI) / 180;
  return {
    ...createCamoFieldContext({ seed: form.seed, scale: form.scale, stretch: ALONG_STRETCH, warpAmp: WARP_AMP }),
    across: form.camoStretch - 1,
    normalX: Math.sin(tilt) * Math.cos(az),
    normalY: Math.sin(tilt) * Math.sin(az),
    normalZ: Math.cos(tilt),
    modNoise: new PerlinNoise3D(form.seed + 307),
    breakAmp: form.tigerBreakup,
    widthAmp: form.tigerWidthVariation
  };
};

const tigerValue = (c: TigerContext, x: number, y: number, z: number): number => {
  const { normalX, normalY, normalZ } = c;
  const d = (x * normalX + y * normalY + z * normalZ) * c.across;
  let v = camoFieldValue(c, x + d * normalX, y + d * normalY, z + d * normalZ);
  if (c.breakAmp > 0) {
    const f = c.invS * BREAK_FREQ;
    v += c.breakAmp * c.modNoise.noise(x * f + 1.7, y * f + 8.3, z * f + 4.1);
  }
  if (c.widthAmp > 0) {
    const f = c.invS * WIDTH_FREQ;
    v += c.widthAmp * c.modNoise.noise(x * f + 9.2, y * f + 3.6, z * f + 6.4);
  }
  return v;
};

export const tigerPattern: PatternDefinition = {
  type: 'tiger',
  label: 'Tiger',
  description: 'Long, thin, broken camouflage strokes that taper at the ends. Use threshold to control how much of the volume is solid.',
  category: 'animals',
  formSections: [
    { title: 'Tiger', fields: ['camoStretch', 'tigerAngle', 'tigerDirection', 'tigerBreakup', 'tigerWidthVariation'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...TIGER_FIELD_KEYS],
  fieldDefaults: {
    scale: 65,
    camoStretch: 4,
    threshold: 36,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.camoStretch, form.tigerAngle, form.tigerDirection, form.tigerBreakup, form.tigerWidthVariation];
  },
  createContext(form) {
    return createTigerContext(form);
  },
  sample(_form, x, y, z, context) {
    return tigerValue(context as TigerContext, x, y, z);
  }
};
