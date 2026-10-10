import type { FormObject } from '../../form/schema';
import { DIGICAMO_FIELD_KEYS } from './fieldKeys';
import { camoFieldValue, createCamoFieldContext, formBounds, percentileIso, type CamoFieldContext } from './camoField';
import type { PatternDefinition } from './types';

interface DigicamoContext extends CamoFieldContext {
  fine: CamoFieldContext;
  pixel: number;
  invPixel: number;
  detailMix: number;
  scatter: number;
  seedHash: number;
}

// Digital camo mixes a second, smaller patch field into the main one, so patches break into clusters at
// two sizes instead of reading as low-resolution woodland camo.
const FINE_RATIO = 2.5;

const hashPixel = (seed: number, x: number, y: number, z: number): number => {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const createDigicamoContext = (form: FormObject): DigicamoContext => ({
  ...createCamoFieldContext({ seed: form.seed, scale: form.scale, stretch: form.camoStretch }),
  fine: createCamoFieldContext({ seed: form.seed + 7, scale: form.scale / FINE_RATIO, stretch: form.camoStretch }),
  pixel: form.camoPixelSize,
  invPixel: 1 / form.camoPixelSize,
  detailMix: form.digiDetailMix,
  scatter: form.digiPixelScatter,
  seedHash: Math.imul(form.seed | 0, 2654435761)
});

const digicamoValue = (c: DigicamoContext, x: number, y: number, z: number): number => {
  const ix = Math.floor(x * c.invPixel);
  const iy = Math.floor(y * c.invPixel);
  const iz = Math.floor(z * c.invPixel);
  const cx = (ix + 0.5) * c.pixel;
  const cy = (iy + 0.5) * c.pixel;
  const cz = (iz + 0.5) * c.pixel;
  const v = (1 - c.detailMix) * camoFieldValue(c, cx, cy, cz) + c.detailMix * camoFieldValue(c.fine, cx, cy, cz);
  const d = (hashPixel(c.seedHash, ix, iy, iz) - 0.5) * c.scatter;
  return Math.min(1, Math.max(0, v + d));
};

export const digicamoPattern: PatternDefinition = {
  type: 'digicamo',
  label: 'Digital Camo',
  description: 'Pixelated two-tone camouflage built from square blocks. Use threshold to control how much of the volume is solid.',
  category: 'effects',
  formSections: [
    { title: 'Digital Camo', fields: ['camoPixelSize', 'camoStretch', 'digiDetailMix', 'digiPixelScatter'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...DIGICAMO_FIELD_KEYS],
  fieldDefaults: {
    scale: 40,
    camoStretch: 1.5,
    camoPixelSize: 3.5,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.camoStretch, form.camoPixelSize, form.digiDetailMix, form.digiPixelScatter];
  },
  createContext(form) {
    return createDigicamoContext(form);
  },
  sample(_form, x, y, z, context) {
    return digicamoValue(context as DigicamoContext, x, y, z);
  },
  createClipField(form) {
    const ctx = createDigicamoContext(form);
    const sample = (x: number, y: number, z: number) => digicamoValue(ctx, x, y, z);
    const bounds = formBounds(form);
    return {
      sample,
      iso: percentileIso(sample, bounds, form.threshold),
      solidHigh: form.thresholdInverse,
      bounds,
      maxCellSize: Math.min(4, Math.max(0.6, ctx.pixel * 0.5))
    };
  }
};
