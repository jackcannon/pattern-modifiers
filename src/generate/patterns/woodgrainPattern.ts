import { SimplexNoise3D } from '../simplex';

import type { FormObject, GrainAxis } from '../../form/schema';
import { WOODGRAIN_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition, PatternSampleContext } from './types';

interface WoodgrainContext extends PatternSampleContext {
  noise: SimplexNoise3D;
  /** Inverse warp-noise feature size (1 / scale) */
  invScale: number;
  octaves: number;
  persistence: number;
  ringSpacing: number;
  invRingSpacing: number;
  warpAmp: number;
  /** Pith (tree centre) location in the cross-section, in lateral u/v coordinates */
  pithU: number;
  pithV: number;
  /** 0 = grain runs along X, 1 = along Y, 2 = along Z */
  axisId: number;
  knotN: number;
  knotA: Float64Array;
  knotU: Float64Array;
  knotV: Float64Array;
  knotAmp: Float64Array;
  /** Precomputed 1 / sigma per knot for the exponential-cusp falloff */
  knotInvSig: Float64Array;
  /** Per-knot along-grain shear: tilts the eye into a swept cathedral flame instead of a flat bullseye */
  knotShear: Float64Array;
}

// Decorrelation offsets so the two warp axes sample different regions of the same noise field.
const WARP_OFF_U = 0;
const WARP_OFF_V = 19.3;

// Knots elongate along the grain (a real branch runs roughly radially through several rings), so the
// along-axis distance is compressed before the Gaussian falloff. This stretches each knot eye along the
// grain direction, matching how knots read on flat-sawn faces.
const KNOT_AXIS_SQUASH = 0.55;

// How far the along-grain shear can tilt a knot, as a fraction of its radial bump per millimetre of
// along-grain distance. This is what makes the rings sweep up into the knot (the flat-sawn "flame")
// instead of forming a symmetric target, which reads as the swirls in the reference photos. Kept gentle
// so the flame stays a set of thin swept lines rather than collapsing into a solid mass.
const KNOT_SHEAR_MAX = 0.4;

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const AXIS_ID: Record<GrainAxis, number> = { x: 0, y: 1, z: 2 };

/**
 * Builds the per-generation woodgrain context: pith location, warp constants and the randomised knot field.
 *
 * @param {FormObject} form - current form settings
 * @returns {WoodgrainContext} sampling context
 */
const buildContext = (form: FormObject): WoodgrainContext => {
  const rand = mulberry32((form.seed | 0) + 0x9e3779b9);

  const axisId = AXIS_ID[form.grainAxis];

  // Lateral cross-section centre and half-extents depend on which axis the log runs along.
  // (X spans -w/2..w/2, Y spans -d/2..d/2, Z spans 0..h.)
  let uCentre: number;
  let uHalf: number;
  let vCentre: number;
  let vHalf: number;
  let aMin: number;
  let aLen: number;

  if (axisId === 0) {
    aMin = -form.width / 2;
    aLen = form.width;
    uCentre = 0;
    uHalf = form.depth / 2;
    vCentre = form.height / 2;
    vHalf = form.height / 2;
  } else if (axisId === 1) {
    aMin = -form.depth / 2;
    aLen = form.depth;
    uCentre = 0;
    uHalf = form.width / 2;
    vCentre = form.height / 2;
    vHalf = form.height / 2;
  } else {
    aMin = 0;
    aLen = form.height;
    uCentre = 0;
    uHalf = form.width / 2;
    vCentre = 0;
    vHalf = form.depth / 2;
  }

  // Keep the pith near the cross-section centre so the end faces show a recognisable bullseye of rings,
  // with a small seeded jitter so different seeds read as different boards.
  const pithU = uCentre + (rand() - 0.5) * 0.3 * uHalf;
  const pithV = vCentre + (rand() - 0.5) * 0.3 * vHalf;

  const ringSpacing = form.ringSpacing;
  const knotN = form.knotCount | 0;

  const knotA = new Float64Array(knotN);
  const knotU = new Float64Array(knotN);
  const knotV = new Float64Array(knotN);
  const knotAmp = new Float64Array(knotN);
  const knotInvSig = new Float64Array(knotN);
  const knotShear = new Float64Array(knotN);

  for (let n = 0; n < knotN; n++) {
    knotA[n] = aMin + rand() * aLen;

    // Branches grow radially outward, so a knot's eye sits out near the bark, not at the pith. Pushing one
    // lateral axis out toward a side face (and keeping the other free to range across it) makes each knot
    // land on one of the four long faces, where it reads as a swirl, instead of being buried in the core.
    const outSign = rand() < 0.5 ? -1 : 1;
    const outFrac = 0.4 + rand() * 0.35;
    const alongFrac = (rand() - 0.5) * 1.6;
    if (rand() < 0.5) {
      knotU[n] = uCentre + outSign * outFrac * uHalf;
      knotV[n] = vCentre + alongFrac * vHalf;
    } else {
      knotV[n] = vCentre + outSign * outFrac * vHalf;
      knotU[n] = uCentre + alongFrac * uHalf;
    }

    // Amplitude in millimetres: pushing the radial field out by a few ring spacings makes a handful of
    // closed rings (the eye) converge at the centre while the surrounding rings bow outward around it.
    knotAmp[n] = ringSpacing * (2 + rand() * 2);
    const sigma = form.knotSize * (0.55 + rand() * 0.45);
    knotInvSig[n] = 1 / sigma;
    knotShear[n] = (rand() - 0.5) * 2 * KNOT_SHEAR_MAX;
  }

  return {
    noise: new SimplexNoise3D(form.seed),
    invScale: 1 / form.scale,
    octaves: form.octaves,
    persistence: form.persistence,
    ringSpacing,
    invRingSpacing: 1 / ringSpacing,
    warpAmp: form.grainWaviness * ringSpacing * 2.2,
    pithU,
    pithV,
    axisId,
    knotN,
    knotA,
    knotU,
    knotV,
    knotAmp,
    knotInvSig,
    knotShear
  };
};

export const woodgrainPattern: PatternDefinition = {
  type: 'woodgrain',
  label: 'Woodgrain',
  description: 'Concentric growth rings with optional knots, oriented along a chosen axis.',
  category: 'effects',
  formSections: [
    { title: 'Woodgrain', fields: ['ringSpacing', 'grainWaviness', 'grainAxis', 'knotCount', 'knotSize'] },
    { title: 'Grain Detail', fields: ['scale', 'seed', 'octaves', 'persistence'] }
  ],
  fieldKeys: [...WOODGRAIN_FIELD_KEYS],
  fieldDefaults: {
    scale: 80,
    octaves: 2,
    persistence: 0.5,
    ringSpacing: 9,
    grainWaviness: 0.6,
    grainAxis: 'z',
    knotCount: 4,
    knotSize: 13,
    threshold: 50,
    thresholdInverse: false,
    previewResolution: 96,
    demoResolution: 80
  },
  cacheKeyParts(form) {
    return [
      form.seed,
      form.scale,
      form.octaves,
      form.persistence,
      form.ringSpacing,
      form.grainWaviness,
      form.grainAxis,
      form.knotCount,
      form.knotSize,
      form.width,
      form.depth,
      form.height
    ];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    const ctx = context as WoodgrainContext;

    // Map world coordinates to along-grain (a) and the two lateral axes (u, v).
    let a: number;
    let u: number;
    let v: number;
    if (ctx.axisId === 0) {
      a = x;
      u = y;
      v = z;
    } else if (ctx.axisId === 1) {
      a = y;
      u = x;
      v = z;
    } else {
      a = z;
      u = x;
      v = y;
    }

    // Domain-warp the lateral position. Because the warp also varies along the grain axis, otherwise straight
    // cylinders become wavy and slice into the flowing cathedral arches seen on flat-sawn faces.
    const nx = x * ctx.invScale;
    const ny = y * ctx.invScale;
    const nz = z * ctx.invScale;
    const wu = ctx.noise.fbm(nx + WARP_OFF_U, ny, nz, ctx.octaves, ctx.persistence) - 0.5;
    const wv = ctx.noise.fbm(nx, ny + WARP_OFF_V, nz, ctx.octaves, ctx.persistence) - 0.5;

    const du = u - ctx.pithU + ctx.warpAmp * wu;
    const dv = v - ctx.pithV + ctx.warpAmp * wv;

    let r = Math.sqrt(du * du + dv * dv);

    // Knots: add a localised radial bump so rings bow around the knot and close into an eye at its centre,
    // plus an along-grain shear so the rings sweep up into the eye as a swirling cathedral flame.
    const knotN = ctx.knotN;
    if (knotN > 0) {
      const knotA = ctx.knotA;
      const knotU = ctx.knotU;
      const knotV = ctx.knotV;
      const knotAmp = ctx.knotAmp;
      const knotInvSig = ctx.knotInvSig;
      const knotShear = ctx.knotShear;
      for (let n = 0; n < knotN; n++) {
        const dAlong = a - knotA[n];
        const da = dAlong * KNOT_AXIS_SQUASH;
        const dku = u - knotU[n];
        const dkv = v - knotV[n];
        const dist = Math.sqrt(da * da + dku * dku + dkv * dkv);
        // Exponential cusp (not a Gaussian) so the bump keeps a steep radial gradient through the centre:
        // rings stay tight and converge into a small dark pith instead of flattening into a solid blob.
        const w = Math.exp(-dist * knotInvSig[n]);
        r += (knotAmp[n] + knotShear[n] * dAlong) * w;
      }
    }

    // Triangle-wave the radius into ring bands: 0 on the ring centreline, 1 midway between rings. With the
    // global threshold keeping the low values, the solid region is the growth rings themselves.
    const phase = r * ctx.invRingSpacing;
    const f = phase - Math.floor(phase);
    const d = f < 0.5 ? f : 1 - f;
    return d * 2;
  }
};
