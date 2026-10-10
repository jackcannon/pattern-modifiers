import { PerlinNoise3D } from '../perlin';

import type { FormObject } from '../../form/schema';
import { createCamoFieldContext, type CamoFieldContext } from './camoField';
import { LABYRINTH_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface LabyrinthContext extends PatternSampleContext {
  noise: PerlinNoise3D;
  domains: CamoFieldContext[];
  invS: number;
  warpAmp: number;
  domainFreq: number;
}

// The pattern is a blend of stripe fields, one per body diagonal. Slow noise picks which field leads in
// each region, so grooves run one way for a while and then turn, like brain coral. Each body diagonal
// is at the same angle to all three model faces, so stripe width is the same on every face. Other axes
// meet some face at a steep angle and their stripes widen into blobs there.
const DOMAIN_AXES: [number, number, number][] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1]
].map(([x, y, z]) => [x / Math.sqrt(3), y / Math.sqrt(3), z / Math.sqrt(3)]);
const WAVES_PER_DOMAIN = 16;
// Straightness sets the cone half-angle of wave directions in each domain: 0 gives this angle, 1 gives
// parallel grooves.
const MAX_STRIPE_SPREAD_DEG = 60;
const WAVELENGTH_JITTER = 0.3;
// Domain frequency at Region Size 1, in cycles per Groove Spacing, and how sharply one domain takes over
// from the next.
const DOMAIN_FREQ = 0.3;
const DOMAIN_SHARPNESS = 6;
// Wiggle is the warp amplitude, which curves the grooves away from the four diagonal directions.
const WARP_FREQ = 0.4;
const FIELD_GAIN = 0.18;

const createLabyrinthContext = (form: FormObject): LabyrinthContext => ({
  noise: new PerlinNoise3D(form.seed + 101),
  domains: DOMAIN_AXES.map((waveAxis, i) =>
    createCamoFieldContext({
      seed: form.seed * 4 + i,
      scale: form.scale,
      stretch: 1,
      waveCount: WAVES_PER_DOMAIN,
      waveAxis,
      waveSpread: (MAX_STRIPE_SPREAD_DEG * (1 - form.labyrinthStraightness) * Math.PI) / 180,
      wavelengthJitter: WAVELENGTH_JITTER
    })
  ),
  invS: 1 / form.scale,
  warpAmp: form.labyrinthWiggle,
  domainFreq: DOMAIN_FREQ / form.labyrinthRegionSize
});

const labyrinthValue = (c: LabyrinthContext, x: number, y: number, z: number): number => {
  const { noise, domains, invS, warpAmp, domainFreq } = c;
  const nx = x * invS;
  const ny = y * invS;
  const nz = z * invS;
  const wx = nx * WARP_FREQ;
  const wy = ny * WARP_FREQ;
  const wz = nz * WARP_FREQ;
  const px = nx + warpAmp * noise.noise(wx + 3.1, wy + 7.7, wz + 1.9);
  const py = ny + warpAmp * noise.noise(wx + 8.4, wy + 2.6, wz + 5.3);
  const pz = nz + warpAmp * noise.noise(wx + 4.8, wy + 9.2, wz + 6.1);

  let sum = 0;
  let weightSq = 0;
  for (let f = 0; f < domains.length; f++) {
    const { waveDirs, wavePhases } = domains[f];
    const w = Math.exp(DOMAIN_SHARPNESS * noise.noise(px * domainFreq + 17 * f, py * domainFreq + 5.3, pz * domainFreq - 11 * f));
    let v = 0;
    for (let i = 0, j = 0; i < WAVES_PER_DOMAIN; i++, j += 3) {
      v += Math.cos(px * waveDirs[j] + py * waveDirs[j + 1] + pz * waveDirs[j + 2] + wavePhases[i]);
    }
    sum += w * v;
    weightSq += w * w;
  }
  // Dividing by the weight norm keeps stripe contrast the same inside a domain and across a border.
  return Math.min(1, Math.max(0, 0.5 + (FIELD_GAIN * sum) / Math.sqrt(weightSq * WAVES_PER_DOMAIN * 0.5)));
};

export const labyrinthPattern: PatternDefinition = {
  type: 'labyrinth',
  label: 'Labyrinth',
  description: 'Winding grooves of even width that run, turn and branch like brain coral or a maze. Use threshold to balance groove and ridge width.',
  category: 'stripes',
  formSections: [
    { title: 'Labyrinth', fields: ['labyrinthWiggle', 'labyrinthStraightness', 'labyrinthRegionSize'] },
    { title: 'Noise', fields: ['scale', 'seed'] }
  ],
  fieldKeys: [...LABYRINTH_FIELD_KEYS],
  fieldDefaults: {
    scale: 16,
    threshold: 50,
    thresholdInverse: false
  },
  cacheKeyParts(form) {
    return [form.seed, form.scale, form.labyrinthWiggle, form.labyrinthStraightness, form.labyrinthRegionSize];
  },
  createContext(form) {
    return createLabyrinthContext(form);
  },
  sample(_form, x, y, z, context) {
    return labyrinthValue(context as LabyrinthContext, x, y, z);
  }
};
