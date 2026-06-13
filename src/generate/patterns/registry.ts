import { perlinPattern } from './perlinPattern';
import { simplexPattern } from './simplexPattern';
import { worleyPattern } from './worleyPattern';
import { voronoiPattern } from './voronoiPattern';

import type { FormObject, PatternType } from '../../form/schema';
import type { PatternCategory, PatternDefinition } from './types';

/** Ordered list of registered patterns. Add or remove entries here */
export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  perlinPattern,
  simplexPattern,
  worleyPattern,
  voronoiPattern
];

export const patternRegistry: Record<PatternType, PatternDefinition> = Object.fromEntries(
  PATTERN_DEFINITIONS.map((def) => [def.type, def])
) as Record<PatternType, PatternDefinition>;

export const getPatternDefinition = (type: PatternType): PatternDefinition => patternRegistry[type];

const PATTERN_CATEGORY_LABELS: Record<PatternCategory, string> = {
  noise: 'Noise',
  cellular: 'Cellular',
  surfaces: 'Surfaces',
  other: 'Other'
};

const PATTERN_CATEGORY_ORDER: PatternCategory[] = ['noise', 'cellular', 'surfaces', 'other'];

export const PATTERN_TYPE_OPTION_GROUPS = PATTERN_CATEGORY_ORDER.map((category) => ({
  label: PATTERN_CATEGORY_LABELS[category],
  options: PATTERN_DEFINITIONS.filter((def) => def.category === category).map((def) => ({
    value: def.type,
    label: def.label
  }))
})).filter((group) => group.options.length > 0);

export const applyPatternDefaults = (form: FormObject, type: PatternType): FormObject => ({
  ...form,
  type,
  ...getPatternDefinition(type).defaultFieldValues
});
