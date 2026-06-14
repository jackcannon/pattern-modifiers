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

/**
 * Analytic (grid-free) field a pattern can supply for demo-mode clipping. Lets patterns whose solid region
 * is too thin to capture on a voxel grid (e.g. topographical lines) classify points exactly instead.
 */
export interface ClipFieldSpec {
  /** Continuous field value at a point; compared against {@link iso} */
  sample(x: number, y: number, z: number): number;
  /** Iso level separating solid from empty */
  iso: number;
  /** When true, values >= iso are solid; when false, values <= iso are solid */
  solidHigh: boolean;
  bounds: PatternBounds;
  /** Longest demo-mesh edge (mm). Drives how finely the clipped mesh is subdivided */
  maxCellSize: number;
}

export interface PatternDefinition {
  type: PatternType;
  label: string;
  category: PatternCategory;
  sectionTitle: string;
  /** Form field keys shown when this pattern is active */
  fieldKeys: (keyof FormObject)[];
  /**
   * Field values applied when the user switches to this pattern, overriding whatever the shared fields
   * (e.g. Feature Size, Octaves) were left at by another pattern. Lets a pattern start from settings that
   * actually suit it rather than inheriting unsuitable values.
   */
  fieldDefaults?: Partial<FormObject>;
  /**
   * When set, the global threshold/inverse controls are ignored: this iso is used directly and the
   * lowest values (value <= iso) are treated as solid. The pattern is responsible for baking its
   * own solid region into the sampled field.
   */
  fixedIso?: number;
  cacheKeyParts(form: FormObject): (string | number)[];
  createContext(form: FormObject): PatternSampleContext;
  sample(form: FormObject, x: number, y: number, z: number, context: PatternSampleContext): number;
  /**
   * Optional bespoke geometry builder. When present, the export/preview mesh is produced by this instead of
   * the shared single-isosurface marching-cubes path. Returns a flat triangle-soup position buffer.
   */
  buildGeometry?(form: FormObject, resolution: number): Float32Array;
  /**
   * Optional analytic clip field for demo mode. When present, demo clipping uses this exact field rather than
   * sampling the voxel grid. Needed for patterns with sub-voxel features.
   */
  createClipField?(form: FormObject, resolution: number): ClipFieldSpec;
}
