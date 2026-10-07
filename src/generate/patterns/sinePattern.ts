import { STRIPE_WAVE_FIELD_KEYS } from './fieldKeys';
import { buildStripeContext, createStripeClipField, sampleStripeSdf, STRIPE_ISO } from './stripeField';
import type { PatternDefinition } from './types';

export const sinePattern: PatternDefinition = {
  type: 'sine',
  label: 'Sine Wave',
  description: 'Stripes that bend in a smooth sine wave. The bend size follows the stripe width.',
  category: 'stripes',
  formSections: [{ title: 'Sine Wave', fields: [...STRIPE_WAVE_FIELD_KEYS] }],
  fieldKeys: [...STRIPE_WAVE_FIELD_KEYS],
  fixedIso: STRIPE_ISO,
  fieldDefaults: {
    stripeWidth: 15,
    stripeGapPct: 100,
    stripeYaw: 0,
    stripePitch: 0,
    stripeWaveAmpPct: 80,
    stripeWaveLenPct: 400
  },
  cacheKeyParts(form) {
    return [form.stripeWidth, form.stripeGapPct, form.stripeYaw, form.stripePitch, form.stripeWaveAmpPct, form.stripeWaveLenPct];
  },
  createContext(form) {
    return buildStripeContext(form, 'sine');
  },
  sample(_form, x, y, z, context) {
    return sampleStripeSdf(context as ReturnType<typeof buildStripeContext>, x, y, z);
  },
  createClipField(form) {
    return createStripeClipField(form, 'sine');
  }
};
