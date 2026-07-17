import { perlinPattern } from './perlinPattern';
import { simplexPattern } from './simplexPattern';
import { worleyPattern } from './worleyPattern';
import { voronoiPattern } from './voronoiPattern';
import { ridgedPattern } from './ridgedPattern';
import { gyroidPattern } from './gyroidPattern';
import { wavesPattern } from './wavesPattern';
import { marblePattern } from './marblePattern';
import { kintsugiPattern } from './kintsugiPattern';
import { woodgrainPattern } from './woodgrainPattern';
import { topographicalPattern } from './topographicalPattern';
import { latticePattern } from './latticePattern';
import { halftonePattern } from './halftonePattern';
import { kelvinPattern } from './kelvinPattern';
import { crosshatchPattern } from './crosshatchPattern';
import { parallelPattern } from './parallelPattern';

import type { FormObject, PatternType } from '../../form/schema';
import type { PatternCategory, PatternDefinition } from './types';

/** Ordered list of registered patterns. Add or remove entries here */
export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  perlinPattern,
  simplexPattern,
  worleyPattern,
  voronoiPattern,
  ridgedPattern,
  gyroidPattern,
  wavesPattern,
  topographicalPattern,
  marblePattern,
  kintsugiPattern,
  woodgrainPattern,
  crosshatchPattern,
  parallelPattern,
  halftonePattern,
  latticePattern,
  kelvinPattern
];

export const patternRegistry: Record<PatternType, PatternDefinition> = Object.fromEntries(
  PATTERN_DEFINITIONS.map((def) => [def.type, def])
) as Record<PatternType, PatternDefinition>;

export const getPatternDefinition = (type: PatternType): PatternDefinition => patternRegistry[type];

/** All form fields owned by one or more patterns (not global fields like threshold) */
export const PATTERN_FIELD_KEYS = new Set<keyof FormObject>(
  PATTERN_DEFINITIONS.flatMap((def) => def.fieldKeys)
);

const PATTERN_CATEGORY_LABELS: Record<PatternCategory, string> = {
  shading: 'Shading',
  effects: 'Effects',
  noise: 'Noise',
  cellular: 'Cellular',
  surfaces: 'Surfaces',
  other: 'Other'
};

const PATTERN_CATEGORY_ORDER: PatternCategory[] = ['effects', 'noise', 'shading', 'cellular', 'surfaces', 'other'];

export const PATTERN_TYPE_OPTION_GROUPS = PATTERN_CATEGORY_ORDER.map((category) => ({
  label: PATTERN_CATEGORY_LABELS[category],
  options: PATTERN_DEFINITIONS.filter((def) => def.category === category).map((def) => ({
    value: def.type,
    label: def.label
  }))
})).filter((group) => group.options.length > 0);

