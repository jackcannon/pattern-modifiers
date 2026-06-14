import type { FormObject } from '../../form/schema';
import type { PatternDefinition } from './types';

const LATTICE_FIELD_KEYS = ['strutSpacing', 'strutRadius'] as const satisfies readonly (keyof FormObject)[];

const rodDistance = (coord: number, spacing: number) => {
  const cell = Math.round(coord / spacing) * spacing;
  return Math.abs(coord - cell);
};

export const latticePattern: PatternDefinition = {
  type: 'lattice',
  label: 'Lattice',
  category: 'other',
  sectionTitle: 'Strut lattice',
  defaultFieldValues: {
    strutSpacing: 20,
    strutRadius: 2.5
  },
  fieldKeys: [...LATTICE_FIELD_KEYS],
  cacheKeyParts(form) {
    return [form.strutSpacing, form.strutRadius];
  },
  createContext() {
    return {};
  },
  sample(form, x, y, z) {
    const { strutSpacing: spacing, strutRadius: radius } = form;
    const dx = rodDistance(x, spacing);
    const dy = rodDistance(y, spacing);
    const dz = rodDistance(z, spacing);

    const distX = Math.hypot(dy, dz);
    const distY = Math.hypot(dx, dz);
    const distZ = Math.hypot(dx, dy);
    const minDist = Math.min(distX, distY, distZ);

    return Math.max(0, 1 - minDist / radius);
  }
};
