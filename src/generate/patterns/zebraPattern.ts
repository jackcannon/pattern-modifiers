import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { ZEBRA_FIELD_KEYS } from './fieldKeys';
import { camoFieldValue, createCamoFieldContext, type CamoFieldContext } from './camoField';
import type { PatternDefinition } from './types';

interface ZebraContext extends CamoFieldContext {
  widthNoise: PerlinNoise3D;
  widthAmp: number;
}

// Wave directions fall in a narrow cone around this axis, which gives near-parallel stripes that fork
// where waves cancel, like a fingerprint. The axis has a component on every model axis so all six faces
// show stripes. Stripe Direction turns it around Z.
const AXIS_LEN = Math.hypot(0.5, 0.6, 0.62);
const AXIS_X = 0.5 / AXIS_LEN;
const AXIS_Y = 0.6 / AXIS_LEN;
const AXIS_Z = 0.62 / AXIS_LEN;
const STRIPE_SPREAD = (20 * Math.PI) / 180;
const WAVE_COUNT = 48;
// Stripes shift by half a period along the lines where the waves cancel. The cone alone makes those lines
// long along the axis, so they show as tears. Forking is the wavelength spread: a value near
// sin(STRIPE_SPREAD) makes those lines short in all directions, so they show as forks.
// Width Variation adds slow noise to the field. This moves the threshold up or down across the model,
// so stripes are thicker in some regions and thinner in others. Frequency is in cycles per Stripe Spacing.
const WIDTH_FREQ = 0.15;

const createZebraContext = (form: FormObject): ZebraContext => {
  const a = (form.zebraDirection * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return {
    ...createCamoFieldContext({
      seed: form.seed,
      scale: form.scale,
      stretch: 1,
      waveCount: WAVE_COUNT,
      warpAmp: form.zebraWaviness,
      warpFreq: 0.25,
      waveAxis: [AXIS_X * ca - AXIS_Y * sa, AXIS_X * sa + AXIS_Y * ca, AXIS_Z],
      waveSpread: STRIPE_SPREAD,
      wavelengthJitter: form.zebraForking,
      smoothWarp: true
    }),
    widthNoise: new PerlinNoise3D(form.seed + 211),
    widthAmp: form.zebraWidthVariation
  };
};

const zebraValue = (c: ZebraContext, x: number, y: number, z: number): number => {
  const v = camoFieldValue(c, x, y, z);
  if (c.widthAmp <= 0) return v;
  const f = c.invS * WIDTH_FREQ;
  return v + c.widthAmp * c.widthNoise.noise(x * f + 5.1, y * f + 2.3, z * f + 8.7);
};

export const zebraPattern: PatternDefinition = {
  type: 'zebra',
  label: 'Zebra',
  description: 'Bold, even stripes that flow, curve and fork like a zebra coat. Use threshold to balance stripe and gap width.',
  category: 'animals',
  formSections: [
    { title: 'Zebra', fields: ['zebraDirection', 'zebraWaviness', 'zebraForking', 'zebraWidthVariation'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...ZEBRA_FIELD_KEYS],
  fieldDefaults: {
    scale: 24,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.zebraDirection, form.zebraWaviness, form.zebraForking, form.zebraWidthVariation];
  },
  createContext(form) {
    return createZebraContext(form);
  },
  sample(_form, x, y, z, context) {
    return zebraValue(context as ZebraContext, x, y, z);
  }
};
