import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { bccEdgeDistance, LATTICE_ROTATION } from './cellLattice';
import { GIRAFFE_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface GiraffeContext extends PatternSampleContext {
  noise: PerlinNoise3D;
  seedHash: number;
  invS: number;
  invStretch: number;
  jitter: number;
  round: number;
  edgeAmp: number;
}

// Patches are cells of a 3D Voronoi diagram on a jittered body-centred cubic lattice, and borders are
// points near a bisector plane. A plain cubic lattice has only a few border orientations; on some faces
// one family runs at a shallow angle and shows as long grey streaks. A face that only clips the corner of
// a cell shows it as a grey hub at a junction, and moderate Patch Irregularity (jitter) keeps these small.
// Corner Rounding is a log-sum-exp smooth-minimum radius in lattice units. Edge Roughness is the amplitude
// of fine noise on the border distance.
// Two feature points per lattice cell, so this many lattice cells per Patch Size keeps the patch size
// close to Patch Size.
const LATTICE_DENSITY = 0.8;
// Small, fast Perlin warp so borders bend a little and are not straight.
const WARP_AMP = 0.08;
const WARP_FREQ = 2.5;
const EDGE_FREQ = 8;

const [R00, R01, R02, R10, R11, R12, R20, R21, R22] = LATTICE_ROTATION;

const createGiraffeContext = (form: FormObject): GiraffeContext => ({
  noise: new PerlinNoise3D(form.seed),
  seedHash: Math.imul(form.seed | 0, 2654435761),
  invS: 1 / form.scale,
  invStretch: 1 / form.giraffeStretch,
  jitter: form.giraffeIrregularity,
  round: form.giraffeRounding,
  edgeAmp: form.giraffeEdgeRoughness
});

const giraffeValue = (c: GiraffeContext, x: number, y: number, zIn: number): number => {
  const { noise, seedHash, invS, jitter, round, edgeAmp } = c;

  const z = zIn * c.invStretch;
  const nx = (R00 * x + R01 * y + R02 * z) * invS;
  const ny = (R10 * x + R11 * y + R12 * z) * invS;
  const nz = (R20 * x + R21 * y + R22 * z) * invS;
  const wx = nx * WARP_FREQ;
  const wy = ny * WARP_FREQ;
  const wz = nz * WARP_FREQ;
  const px = nx + WARP_AMP * noise.noise(wx + 3.1, wy + 7.7, wz + 1.9);
  const py = ny + WARP_AMP * noise.noise(wx + 8.4, wy + 2.6, wz + 5.3);
  const pz = nz + WARP_AMP * noise.noise(wx + 4.8, wy + 9.2, wz + 6.1);

  const d = LATTICE_DENSITY;
  const edge =
    bccEdgeDistance(seedHash, jitter, round, px * d, py * d, pz * d) / d +
    edgeAmp * noise.noise(px * EDGE_FREQ + 11.3, py * EDGE_FREQ + 2.9, pz * EDGE_FREQ + 6.6);
  return Math.max(0, 1 - 2 * edge);
};

export const giraffePattern: PatternDefinition = {
  type: 'giraffe',
  label: 'Giraffe',
  description: 'Solid patches with rounded corners, split by a network of even borders like a giraffe coat. Use threshold to control border width.',
  category: 'animals',
  formSections: [
    { title: 'Giraffe', fields: ['giraffeIrregularity', 'giraffeRounding', 'giraffeEdgeRoughness', 'giraffeStretch'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...GIRAFFE_FIELD_KEYS],
  fieldDefaults: {
    scale: 30,
    threshold: 72,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.giraffeIrregularity, form.giraffeRounding, form.giraffeEdgeRoughness, form.giraffeStretch];
  },
  createContext(form) {
    return createGiraffeContext(form);
  },
  sample(_form, x, y, z, context) {
    return giraffeValue(context as GiraffeContext, x, y, z);
  }
};
