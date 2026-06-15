import { SimplexNoise3D } from '../simplex';

import type { FormObject } from '../../form/schema';
import { MARBLE_FIELD_KEYS, NOISE_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface MarbleContext extends PatternSampleContext {
  noise: SimplexNoise3D;
}

// Fixed offsets used to decorrelate the three components of the domain-warp vector. They are arbitrary
// non-repeating constants so each warp axis samples a different region of the same noise field.
const OFF_X1 = 0;
const OFF_Y1 = 0;
const OFF_Z1 = 0;
const OFF_X2 = 5.2;
const OFF_Y2 = 1.3;
const OFF_Z2 = 8.3;
const OFF_X3 = 2.8;
const OFF_Y3 = 7.4;
const OFF_Z3 = 3.5;

// Second-pass offsets (warp of the warp) for the extra curl that gives the liquid-marble look.
const OFF_X4 = 9.7;
const OFF_Y4 = 2.1;
const OFF_Z4 = 4.6;
const OFF_X5 = 1.4;
const OFF_Y5 = 6.9;
const OFF_Z5 = 0.8;
const OFF_X6 = 7.2;
const OFF_Y6 = 3.3;
const OFF_Z6 = 5.9;

// Band-flow direction. Veins run perpendicular to this vector, giving a natural diagonal flow rather than
// axis-aligned stripes that would read as obviously machine-made on flat faces.
const DIR_X = 0.82;
const DIR_Y = 0.52;
const DIR_Z = 0.24;

export const marblePattern: PatternDefinition = {
  type: 'marble',
  label: 'Marble',
  category: 'effects',
  formSections: [
    { title: 'Marble', fields: ['veinSpacing', 'swirl'] },
    { title: 'Noise', fields: [...NOISE_FIELD_KEYS] }
  ],
  fieldKeys: [...MARBLE_FIELD_KEYS],
  fieldDefaults: {
    scale: 85,
    octaves: 1,
    persistence: 0.5,
    veinSpacing: 20,
    swirl: 1.3,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.octaves, form.persistence, form.veinSpacing, form.swirl];
  },
  createContext(form) {
    return { noise: new SimplexNoise3D(form.seed) };
  },
  sample(form, x, y, z, context) {
    const { noise } = context as MarbleContext;
    const s = form.scale;
    const octaves = form.octaves;
    const persistence = form.persistence;

    const nx = x / s;
    const ny = y / s;
    const nz = z / s;

    // First domain-warp vector (centred to [-0.5, 0.5] per component).
    const q1 = noise.fbm(nx + OFF_X1, ny + OFF_Y1, nz + OFF_Z1, octaves, persistence) - 0.5;
    const q2 = noise.fbm(nx + OFF_X2, ny + OFF_Y2, nz + OFF_Z2, octaves, persistence) - 0.5;
    const q3 = noise.fbm(nx + OFF_X3, ny + OFF_Y3, nz + OFF_Z3, octaves, persistence) - 0.5;

    // Second warp pass, sampling the field offset by the first warp. Folding the warp back on itself is what
    // turns simple wavy bands into the curling, liquid-marble swirls seen in real poured-acrylic marble.
    const r1 = noise.fbm(nx + 4 * q1 + OFF_X4, ny + 4 * q2 + OFF_Y4, nz + 4 * q3 + OFF_Z4, octaves, persistence) - 0.5;
    const r2 = noise.fbm(nx + 4 * q2 + OFF_X5, ny + 4 * q3 + OFF_Y5, nz + 4 * q1 + OFF_Z5, octaves, persistence) - 0.5;
    const r3 = noise.fbm(nx + 4 * q3 + OFF_X6, ny + 4 * q1 + OFF_Y6, nz + 4 * q2 + OFF_Z6, octaves, persistence) - 0.5;

    // Warp displacement measured in vein widths (not feature widths) so the fold strength stays consistent
    // as the user changes Feature Size: Feature Size sets the *scale* of the swirls, Swirl sets how hard the
    // veins fold. swirl ~1 displaces veins by roughly two band widths, which reads as gentle marbling.
    const amp = form.swirl * form.veinSpacing * 2;
    const wx = x + amp * (q1 + 0.4 * r1);
    const wy = y + amp * (q2 + 0.4 * r2);
    const wz = z + amp * (q3 + 0.4 * r3);

    const coord = wx * DIR_X + wy * DIR_Y + wz * DIR_Z;
    const v = Math.sin((coord * Math.PI) / form.veinSpacing);
    return 0.5 + 0.5 * v;
  }
};
