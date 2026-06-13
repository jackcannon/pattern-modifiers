import { FormObject, PatternType } from '../../form/schema';

export const OUTSIDE_FIELD = -1e9;

export interface PatternBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type PatternSampleContext = {
  dispose?(): void;
  [key: string]: unknown;
};

export type PatternCategory = 'noise' | 'cellular' | 'surfaces' | 'other';

export interface PatternDefinition {
  type: PatternType;
  label: string;
  category: PatternCategory;
  sectionTitle: string;
  /** Suggested starting values when this pattern is selected */
  defaultFieldValues: Partial<FormObject>;
  /** Form field keys shown when this pattern is active */
  fieldKeys: (keyof FormObject)[];
  cacheKeyParts(form: FormObject): (string | number)[];
  createContext(form: FormObject): PatternSampleContext;
  sample(form: FormObject, x: number, y: number, z: number, context: PatternSampleContext): number;
}
