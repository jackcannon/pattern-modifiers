import type { FormObject } from '../../form/schema';
import { LATTICE_FIELD_KEYS } from './fieldKeys';
import type { PatternDefinition } from './types';

const rodDistance = (coord: number, spacing: number) => {
  const cell = Math.round(coord / spacing) * spacing;
  return Math.abs(coord - cell);
};

export const latticePattern: PatternDefinition = {
  type: 'lattice',
  label: 'Lattice',
  description: 'Simple cubic strut scaffold with rods at regular spacing along each axis.',
  category: 'other',
  formSections: [{ title: 'Lattice', fields: [...LATTICE_FIELD_KEYS] }],
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
