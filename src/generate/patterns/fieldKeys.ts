import type { FormObject } from '../../form/schema';

export const NOISE_FIELD_KEYS = ['scale', 'seed', 'octaves', 'persistence'] as const satisfies readonly (keyof FormObject)[];

export const CELLULAR_FIELD_KEYS = ['scale', 'seed'] as const satisfies readonly (keyof FormObject)[];

export const TOPOGRAPHICAL_FIELD_KEYS = ['lineThickness', 'lineSpacing'] as const satisfies readonly (keyof FormObject)[];

export const GYROID_FIELD_KEYS = ['period', 'phase'] as const satisfies readonly (keyof FormObject)[];

export const WAVES_FIELD_KEYS = ['wavelength', 'amplitude'] as const satisfies readonly (keyof FormObject)[];

export const LATTICE_FIELD_KEYS = ['strutSpacing', 'strutRadius'] as const satisfies readonly (keyof FormObject)[];

export const MARBLE_FIELD_KEYS = ['veinSpacing', 'swirl', 'scale', 'seed', 'octaves', 'persistence'] as const satisfies readonly (keyof FormObject)[];

export const KINTSUGI_FIELD_KEYS = ['crackWidth', 'crackJaggedness', 'scale', 'seed'] as const satisfies readonly (keyof FormObject)[];
