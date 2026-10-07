import type { FormObject } from '../../form/schema';
import type { PatternSampleContext } from './types';

export const STRIPE_ISO = 0;

export type StripeWave = 'flat' | 'sine' | 'zigzag';

export interface StripeContext extends PatternSampleContext {
  nx: number;
  ny: number;
  nz: number;
  ax: number;
  ay: number;
  az: number;
  on: number;
  period: number;
  halfOn: number;
  amp: number;
  invWavelength: number;
  wave: StripeWave;
}

const stripeAxes = (nx: number, ny: number, nz: number) => {
  let ax = ny;
  let ay = -nx;
  let az = 0;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-8) return { ax: 1, ay: 0, az: 0 };
  return { ax: ax / len, ay: ay / len, az: az / len };
};

export const buildStripeContext = (form: FormObject, wave: StripeWave): StripeContext => {
  const yaw = (form.stripeYaw * Math.PI) / 180;
  const pitch = (form.stripePitch * Math.PI) / 180;
  const cp = Math.cos(pitch);
  const nx = cp * Math.cos(yaw);
  const ny = cp * Math.sin(yaw);
  const nz = Math.sin(pitch);
  const axes = stripeAxes(nx, ny, nz);
  const on = form.stripeWidth;
  const gap = on * (form.stripeGapPct / 100);
  const amp = wave === 'flat' ? 0 : on * (form.stripeWaveAmpPct / 100);
  const wavelength = wave === 'flat' ? on : Math.max(on * (form.stripeWaveLenPct / 100), 1e-3);

  return {
    nx,
    ny,
    nz,
    ...axes,
    on,
    period: on + gap,
    halfOn: on * 0.5,
    amp,
    invWavelength: 1 / wavelength,
    wave
  };
};

const waveShift = (ctx: StripeContext, along: number): { shift: number; slope: number } => {
  if (ctx.wave === 'sine') {
    const phase = along * ctx.invWavelength * Math.PI * 2;
    return {
      shift: ctx.amp * Math.sin(phase),
      slope: ctx.amp * ctx.invWavelength * Math.PI * 2 * Math.cos(phase)
    };
  }
  if (ctx.wave === 'zigzag') {
    let p = (along * ctx.invWavelength) % 1;
    if (p < 0) p += 1;
    const rising = p < 0.5;
    return {
      shift: ctx.amp * (rising ? p * 4 - 1 : 3 - p * 4),
      slope: ctx.amp * ctx.invWavelength * (rising ? 4 : -4)
    };
  }
  return { shift: 0, slope: 0 };
};

export const sampleStripeSdf = (ctx: StripeContext, x: number, y: number, z: number): number => {
  if (ctx.period - ctx.on < 1e-6) return -1;

  const along = x * ctx.ax + y * ctx.ay + z * ctx.az;
  const { shift, slope } = waveShift(ctx, along);
  const t = x * ctx.nx + y * ctx.ny + z * ctx.nz - shift;
  let u = (t + ctx.halfOn) % ctx.period;
  if (u < 0) u += ctx.period;

  const normalDist = u < ctx.on ? -Math.min(u, ctx.on - u) : Math.min(u - ctx.on, ctx.period - u);
  return normalDist / Math.sqrt(1 + slope * slope);
};

export const stripeBounds = (form: FormObject) => ({
  minX: -form.width / 2,
  maxX: form.width / 2,
  minY: -form.depth / 2,
  maxY: form.depth / 2,
  minZ: 0,
  maxZ: form.height
});

export const stripeClipMaxCell = (on: number, gap: number, wavelength?: number): number => {
  const feature = gap > 0 ? Math.min(on, gap) : on;
  const detail = wavelength === undefined ? feature : Math.min(feature, wavelength * 0.25);
  return Math.min(4, Math.max(0.6, detail * 0.5));
};

export const createStripeClipField = (form: FormObject, wave: StripeWave) => {
  const ctx = buildStripeContext(form, wave);
  const gap = form.stripeWidth * (form.stripeGapPct / 100);
  const wavelength = wave === 'flat' ? undefined : form.stripeWidth * (form.stripeWaveLenPct / 100);

  return {
    sample: (x: number, y: number, z: number) => sampleStripeSdf(ctx, x, y, z),
    iso: STRIPE_ISO,
    solidHigh: false,
    bounds: stripeBounds(form),
    maxCellSize: stripeClipMaxCell(form.stripeWidth, gap, wavelength)
  };
};
