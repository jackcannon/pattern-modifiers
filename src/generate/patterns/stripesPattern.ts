import { STRIPES_FIELD_KEYS } from './fieldKeys';
import { buildStripeContext, createStripeClipField, sampleStripeSdf, STRIPE_ISO } from './stripeField';
import type { PatternDefinition } from './types';

export const stripesPattern: PatternDefinition = {
  type: 'stripes',
  label: 'Stripes',
  description: 'Solid stripes of a fixed width, separated by gaps, through the volume.',
  category: 'stripes',
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
    return buildStripeContext(form, 'flat');
  },
  sample(_form, x, y, z, context) {
    return sampleStripeSdf(context as ReturnType<typeof buildStripeContext>, x, y, z);
  },
  createClipField(form) {
    return createStripeClipField(form, 'flat');
  }
};
