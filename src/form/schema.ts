import z from 'zod';
import { MathsTools } from 'swiss-ak';

import { applyPatternDefaults, PATTERN_DEFINITIONS, PATTERN_TYPE_OPTION_GROUPS } from '../generate/patterns/registry';

import { DEFAULT_BUILD_VOLUME_PRESET_ID } from './buildVolumePresets';

export const DemoModelSchema = z.enum(['cube', 'sphere', 'teapot', 'suzanne', 'bunny', 'benchy']);
export type DemoModelType = z.infer<typeof DemoModelSchema>;

export const PatternTypeSchema = z.enum(['perlin', 'simplex', 'worley']);
export type PatternType = z.infer<typeof PatternTypeSchema>;

const NOISE_PATTERN_TYPES = ["perlin","simplex"] as const satisfies readonly PatternType[];
const CELL_PATTERN_TYPES = ["worley"] as const satisfies readonly PatternType[];

export const FormSchema = z.object({
  type: PatternTypeSchema,
  buildVolumePreset: z.string(),
  width: z.number().min(0.01),
  height: z.number().min(0.01),
  depth: z.number().min(0.01),
  threshold: z.number().min(1).max(99),
  thresholdInverse: z.boolean(),
  seed: z.number(),
  scale: z.number().min(1),
  octaves: z.number().int().min(1).max(6),
  persistence: z.number().min(0.1).max(1),

  previewResolution: z.number().int().min(16).max(256),
  exportResolution: z.number().int().min(16).max(256),
  demoEnabled: z.boolean(),
  demoModel: DemoModelSchema,
  demoSize: z.number().min(5).max(200),
  demoResolution: z.number().int().min(8).max(128),
  fileName: z.string()
});

export type FormSchemaType = typeof FormSchema;
export type FormObject = z.infer<FormSchemaType>;
export type FormPropName = keyof FormObject;

export type FormInputType = 'slider' | 'number' | 'text' | 'switch' | 'boolean' | 'toggle_button' | 'select';
export interface FormInputConfig {
  paramName: string;
  type: FormInputType;
  displayName: string;
  description: string;
  warning?: string;
  note?: string;
  defaultValue: any;
  unit?: string;
  sliderStep?: number;
  inputStep?: number;
  min?: number;
  max?: ((formObj: FormObject) => number) | number;
  trueLabel?: string;
  falseLabel?: string;
  options?: { value: any; label: string }[];
  optionGroups?: { label: string; options: { value: any; label: string }[] }[];
  /** When set, field belongs to this pattern type and is omitted from share URLs for other patterns */
  patternId?: PatternType;
  /** When set, field is shown for any of these pattern types */
  patternIds?: readonly PatternType[];
  /** Share URL param name per pattern type (falls back to paramName) */
  paramNameByPattern?: Partial<Record<PatternType, string>>;
  show?: (formObj: FormObject) => boolean;
  randomize?: () => any;
  placeholder?: (formObj: FormObject) => string;
}

export const getShareParamName = (key: FormPropName, type: PatternType): string => {
  const config = formConfig[key];
  return config.paramNameByPattern?.[type] ?? config.paramName;
};

export const isFieldActive = (config: FormInputConfig, form: FormObject): boolean => {
  if (config.patternIds?.length && !config.patternIds.includes(form.type)) return false;
  if (config.patternId && form.type !== config.patternId) return false;
  return config.show ? config.show(form) : true;
};

export const getDefaultFileName = (form: FormObject) => {
  const parts = [`pattern-modifier-${form.type}-${form.width}x${form.depth}x${form.height}`];

  if ((["perlin","simplex"] as PatternType[]).includes(form.type)) {
    parts.push(`sc${form.scale}`);
  }

  else if ((["worley"] as PatternType[]).includes(form.type)) {
    parts.push(`sc${form.scale}`);
  }

  parts.push(`th${form.threshold}${form.thresholdInverse ? 'i' : ''}`);
  return parts.join('-');
};

export const demoModeSectionNote =
  'Demo mode only gives a very rough demonstration of what the modifier might look like.';

export const formConfig: { [K in FormPropName]: FormInputConfig } = {
  type: {
    paramName: 't',
    type: 'select',
    displayName: 'Pattern',
    description: 'Type of pattern to generate',
    defaultValue: 'perlin',
    optionGroups: PATTERN_TYPE_OPTION_GROUPS
  },
  buildVolumePreset: {
    paramName: 'bv',
    type: 'select',
    displayName: 'Printer',
    description: 'Build plate size shown in the 3D preview',
    defaultValue: DEFAULT_BUILD_VOLUME_PRESET_ID,
    options: []
  },
  width: {
    paramName: 'w',
    type: 'slider',
    displayName: 'Model Width',
    description: 'Width (X axis) of the generated pattern modifier',
    defaultValue: 200,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  depth: {
    paramName: 'd',
    type: 'slider',
    displayName: 'Model Depth',
    description: 'Depth (Y axis) of the generated pattern modifier',
    defaultValue: 200,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  height: {
    paramName: 'h',
    type: 'slider',
    displayName: 'Model Height',
    description: 'Height (Z axis) of the generated pattern modifier',
    defaultValue: 200,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  threshold: {
    paramName: 'th',
    type: 'slider',
    displayName: 'Threshold',
    description: 'Cutoff percentile for the pattern — with Inverse off, the lowest values up to this point are solid; with Inverse on, the highest values from this point upward are solid',
    defaultValue: 50,
    unit: '%',
    sliderStep: 1,
    inputStep: 1,
    min: 1,
    max: 99
  },
  thresholdInverse: {
    paramName: 'inv',
    type: 'boolean',
    displayName: 'Inverse',
    description: 'Flip which side of the threshold is solid — off keeps the lowest values (0% to threshold), on keeps the highest (threshold to 100%)',
    defaultValue: false
  },
  seed: {
    paramName: 'per_s',
    type: 'number',
    displayName: 'Seed',
    description: 'Random seed for the pattern — same seed always produces the same result',
    defaultValue: 0,
    inputStep: 1,
    patternIds: ["perlin","simplex","worley"],
    paramNameByPattern: {
      perlin: 'per_s',
      simplex: 'sim_s',
      worley: 'wor_s'
    },
    randomize: () => Math.floor(Math.random() * 1000000)
  },
  scale: {
    paramName: 'per_sc',
    type: 'slider',
    displayName: 'Feature Size',
    description: 'Size of pattern features — larger values produce bigger, smoother shapes',
    defaultValue: 10,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 300,
    patternIds: ["perlin","simplex","worley"],
    paramNameByPattern: {
      perlin: 'per_sc',
      simplex: 'sim_sc',
      worley: 'wor_sc'
    }
  },
  octaves: {
    paramName: 'per_oc',
    type: 'slider',
    displayName: 'Octaves',
    description: 'Number of noise layers — more octaves add finer detail on top of the base pattern',
    defaultValue: 2,
    sliderStep: 1,
    inputStep: 1,
    min: 1,
    max: 6,
    patternIds: ["perlin","simplex"],
    paramNameByPattern: {
      perlin: 'per_oc',
      simplex: 'sim_oc'
    }
  },
  persistence: {
    paramName: 'per_p',
    type: 'slider',
    displayName: 'Persistence',
    description: 'How strongly each extra octave contributes — higher values make fine detail more prominent',
    defaultValue: 0.15,
    sliderStep: 0.05,
    inputStep: 0.05,
    min: 0.1,
    max: 1,
    patternIds: ["perlin","simplex"],
    paramNameByPattern: {
      perlin: 'per_p',
      simplex: 'sim_p'
    },
    show: (form) => form.octaves > 1
  },

  previewResolution: {
    paramName: 'pr',
    type: 'slider',
    displayName: 'Preview Resolution',
    description: 'Mesh detail for the 3D preview — number of grid cells along the longest axis',
    warning: 'High values can make the preview slow to update',
    defaultValue: 72,
    sliderStep: 8,
    inputStep: 1,
    min: 16,
    max: 256
  },
  exportResolution: {
    paramName: 'er',
    type: 'slider',
    displayName: 'Export Resolution',
    description: 'Mesh detail for the exported STL — number of grid cells along the longest axis',
    warning: 'High values can make export slow and produce large files',
    defaultValue: 192,
    sliderStep: 8,
    inputStep: 1,
    min: 16,
    max: 256
  },
  demoEnabled: {
    paramName: 'de',
    type: 'boolean',
    displayName: 'Demo Mode',
    description: 'Preview how the pattern modifier affects a sample model sitting on the build plate',
    defaultValue: false
  },
  demoModel: {
    paramName: 'dm',
    type: 'select',
    displayName: 'Demo Model',
    description: 'Example object to show clipped by the pattern modifier',
    defaultValue: 'cube',
    options: [
      { value: 'cube', label: 'Cube' },
      { value: 'sphere', label: 'Sphere' },
      { value: 'teapot', label: 'Teapot' },
      { value: 'suzanne', label: 'Suzanne' },
      { value: 'bunny', label: 'Stanford Bunny' },
      { value: 'benchy', label: 'Benchy' }
    ],
    show: (form) => form.demoEnabled
  },
  demoSize: {
    paramName: 'ds',
    type: 'slider',
    displayName: 'Demo Size (Height)',
    description: 'Height of the demo model in millimetres',
    defaultValue: 50,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 1,
    min: 5,
    max: 200,
    show: (form) => form.demoEnabled
  },
  demoResolution: {
    paramName: 'dr',
    type: 'slider',
    displayName: 'Demo Resolution',
    description: 'Pattern detail used for demo clipping — grid cells along the longest axis',
    warning: 'Higher values improve demo quality but slow down updates',
    defaultValue: 36,
    sliderStep: 4,
    inputStep: 1,
    min: 8,
    max: 128,
    show: (form) => form.demoEnabled
  },
  fileName: {
    paramName: 'fn',
    type: 'text',
    displayName: 'File Name',
    description: 'Name of the downloaded STL file — leave blank to use the auto-generated name',
    defaultValue: '',
    unit: '.stl',
    placeholder: (form) => getDefaultFileName(form)
  }
};

export type FormGroupDef =
  | FormPropName
  | FormPropName[]
  | {
      patternId?: PatternType;
      title?: string;
      fields: FormPropName[];
    };

export const formGroups: FormGroupDef[] = [
  ['type'],
  ['buildVolumePreset'],
  ['width', 'depth', 'height'],
  ['threshold', 'thresholdInverse'],
  ...PATTERN_DEFINITIONS.map((def) => ({
    patternId: def.type,
    title: def.sectionTitle,
    fields: def.fieldKeys
  })),
  ['previewResolution', 'exportResolution'],
  ['demoEnabled', 'demoModel', 'demoSize', 'demoResolution'],
  ['fileName']
];

export const createDefaultFormObj = (): FormObject => {
  const obj = Object.fromEntries(Object.entries(formConfig).map(([key, value]) => [key, value.defaultValue])) as FormObject;
  obj.seed = formConfig.seed.randomize!();
  return applyPatternDefaults(obj, obj.type);
};
