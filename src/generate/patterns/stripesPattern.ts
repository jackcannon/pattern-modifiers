import type { FormObject } from '../../form/schema';

import { STRIPES_FIELD_KEYS } from './fieldKeys';
import type { ClipFieldSpec, PatternDefinition, PatternSampleContext } from './types';

const STRIPE_ISO = 0;

interface StripeContext extends PatternSampleContext {
  nx: number;
  ny: number;
  nz: number;
  on: number;
  period: number;
  halfOn: number;
}

const buildContext = (form: FormObject): StripeContext => {
  const yaw = (form.stripeYaw * Math.PI) / 180;
  const pitch = (form.stripePitch * Math.PI) / 180;
  const cp = Math.cos(pitch);
  const on = form.stripeWidth;
  const gap = on * (form.stripeGapPct / 100);

  return {
    nx: cp * Math.cos(yaw),
    ny: cp * Math.sin(yaw),
    nz: Math.sin(pitch),
    on,
    period: on + gap,
    halfOn: on * 0.5
  };
};

const sampleStripeSdf = (ctx: StripeContext, x: number, y: number, z: number): number => {
  if (ctx.period - ctx.on < 1e-6) return -1;

  const t = x * ctx.nx + y * ctx.ny + z * ctx.nz;
  let u = (t + ctx.halfOn) % ctx.period;
  if (u < 0) u += ctx.period;

  if (u < ctx.on) return -Math.min(u, ctx.on - u);
  return Math.min(u - ctx.on, ctx.period - u);
};

const stripeBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

const stripeClipMaxCell = (on: number, gap: number): number => {
  const feature = gap > 0 ? Math.min(on, gap) : on;
  return Math.min(4, Math.max(0.6, feature * 0.5));
};

const createStripeClipField = (form: FormObject): ClipFieldSpec => {
  const ctx = buildContext(form);
  const gap = form.stripeWidth * (form.stripeGapPct / 100);

  return {
    sample: (x, y, z) => sampleStripeSdf(ctx, x, y, z),
    iso: STRIPE_ISO,
    solidHigh: false,
    bounds: stripeBounds(form),
    maxCellSize: stripeClipMaxCell(form.stripeWidth, gap)
  };
};

export const stripesPattern: PatternDefinition = {
  type: 'stripes',
  label: 'Stripes',
  description: 'Solid stripes of a fixed width, separated by gaps, through the volume.',
  category: 'other',
  formSections: [{ title: 'Stripes', fields: [...STRIPES_FIELD_KEYS] }],
  fieldKeys: [...STRIPES_FIELD_KEYS],
  fixedIso: STRIPE_ISO,
  fieldDefaults: {
    stripeWidth: 15,
    stripeGapPct: 100,
    stripeYaw: 0,
    stripePitch: 0
  },
  cacheKeyParts(form) {
    return [form.stripeWidth, form.stripeGapPct, form.stripeYaw, form.stripePitch];
  },
  createContext(form) {
    return buildContext(form);
  },
  sample(_form, x, y, z, context) {
    return sampleStripeSdf(context as StripeContext, x, y, z);
  },
  createClipField(form) {
    return createStripeClipField(form);
  }
};
