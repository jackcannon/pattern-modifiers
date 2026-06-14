import z from 'zod';
import { MathsTools } from 'swiss-ak';

import { getPatternDefinition, PATTERN_DEFINITIONS, PATTERN_FIELD_KEYS, PATTERN_TYPE_OPTION_GROUPS } from '../generate/patterns/registry';

import { DEFAULT_BUILD_VOLUME_PRESET_ID } from './buildVolumePresets';

export const DemoModelSchema = z.enum(['cube', 'sphere', 'teapot', 'suzanne', 'bunny', 'benchy']);
export type DemoModelType = z.infer<typeof DemoModelSchema>;

export const PatternTypeSchema = z.enum(['perlin', 'simplex', 'worley', 'voronoi', 'ridged', 'gyroid', 'waves', 'topographical', 'lattice']);
export type PatternType = z.infer<typeof PatternTypeSchema>;

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
  period: z.number().min(1),
  phase: z.number(),
  wavelength: z.number().min(1),
  amplitude: z.number().min(0.01).max(1),
  strutSpacing: z.number().min(1),
  strutRadius: z.number().min(0.1),
  lineSpacing: z.number().min(1).max(50),
  lineThickness: z.number().min(0.5).max(20),

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
  displayName: string | ((formObj: FormObject) => string);
  description: string | ((formObj: FormObject) => string);
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
  show?: (formObj: FormObject) => boolean;
  randomize?: () => any;
  placeholder?: (formObj: FormObject) => string;
}

export type ResolvedFormInputConfig = Omit<FormInputConfig, 'displayName' | 'description'> & {
  displayName: string;
  description: string;
};

export const resolveFormText = (
  text: string | ((formObj: FormObject) => string),
  form: FormObject
): string => (typeof text === 'function' ? text(form) : text);

export const isFieldActive = (key: FormPropName, form: FormObject): boolean => {
  const config = formConfig[key];
  if (PATTERN_FIELD_KEYS.has(key) && !getPatternDefinition(form.type).fieldKeys.includes(key)) {
    return false;
  }
  return config.show ? config.show(form) : true;
};

export const getDefaultFileName = (form: FormObject) => {
  const parts = [`pattern-modifier-${form.type}-${form.width}x${form.depth}x${form.height}`];
  const patternFields = getPatternDefinition(form.type).fieldKeys;

  if (patternFields.includes('scale')) parts.push(`sc${form.scale}`);
  else if (patternFields.includes('period')) parts.push(`gp${form.period}`);
  else if (patternFields.includes('wavelength')) parts.push(`wl${form.wavelength}`);
  else if (patternFields.includes('strutSpacing')) parts.push(`lsp${form.strutSpacing}`);

  if (form.type === 'topographical') {
    parts.push(`tp${form.lineSpacing}-${form.lineThickness}mm`);
  } else {
    parts.push(`th${form.threshold}${form.thresholdInverse ? 'i' : ''}`);
  }
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
    max: 99,
    show: (form) => form.type !== 'topographical'
  },
  thresholdInverse: {
    paramName: 'inv',
    type: 'boolean',
    displayName: 'Inverse',
    description: 'Flip which side of the threshold is solid — off keeps the lowest values (0% to threshold), on keeps the highest (threshold to 100%)',
    defaultValue: false,
    show: (form) => form.type !== 'topographical'
  },
  seed: {
    paramName: 's',
    type: 'number',
    displayName: 'Seed',
    description: 'Random seed for the pattern — same seed always produces the same result',
    defaultValue: 0,
    inputStep: 1,
    randomize: () => Math.floor(Math.random() * 1000000)
  },
  scale: {
    paramName: 'sc',
    type: 'slider',
    displayName: (form) => (form.type === 'worley' || form.type === 'voronoi' ? 'Cell Size' : 'Feature Size'),
    description: (form) =>
      form.type === 'worley' || form.type === 'voronoi'
        ? 'Size of each cell — larger values produce bigger cells'
        : 'Size of pattern features — larger values produce bigger, smoother shapes',
    defaultValue: 10,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 300
  },
  octaves: {
    paramName: 'oc',
    type: 'slider',
    displayName: 'Octaves',
    description: 'Number of noise layers — more octaves add finer detail on top of the base pattern',
    defaultValue: 2,
    sliderStep: 1,
    inputStep: 1,
    min: 1,
    max: 6
  },
  persistence: {
    paramName: 'pers',
    type: 'slider',
    displayName: 'Persistence',
    description: 'How strongly each extra octave contributes — higher values make fine detail more prominent',
    defaultValue: 0.15,
    sliderStep: 0.05,
    inputStep: 0.05,
    min: 0.1,
    max: 1,
    show: (form) => form.octaves > 1
  },
  period: {
    paramName: 'gp',
    type: 'slider',
    displayName: 'Period',
    description: 'Distance between gyroid surface repeats',
    defaultValue: 25,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 200
  },
  phase: {
    paramName: 'gph',
    type: 'slider',
    displayName: 'Phase',
    description: 'Rotates the gyroid surface in space',
    defaultValue: 0,
    unit: 'rad',
    sliderStep: 0.1,
    inputStep: 0.05,
    min: 0,
    max: 6.28
  },
  wavelength: {
    paramName: 'wl',
    type: 'slider',
    displayName: 'Wavelength',
    description: 'Distance between wave peaks along each axis',
    defaultValue: 50,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 300
  },
  amplitude: {
    paramName: 'amp',
    type: 'slider',
    displayName: 'Amplitude',
    description: 'Strength of the wave bands — higher values create stronger contrast',
    defaultValue: 0.35,
    sliderStep: 0.05,
    inputStep: 0.05,
    min: 0.01,
    max: 1
  },
  strutSpacing: {
    paramName: 'lsp',
    type: 'slider',
    displayName: 'Strut Spacing',
    description: 'Distance between lattice struts on the grid',
    defaultValue: 20,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 200
  },
  strutRadius: {
    paramName: 'lr',
    type: 'slider',
    displayName: 'Strut Radius',
    description: 'Thickness of each lattice strut',
    defaultValue: 2.5,
    unit: 'mm',
    sliderStep: 0.5,
    inputStep: 0.25,
    min: 0.1,
    max: 50
  },
  lineSpacing: {
    paramName: 'tls',
    type: 'slider',
    displayName: 'Line Spacing',
    description: 'Interval between topographical lines as a percentage of the noise value range — smaller values pack in more lines',
    defaultValue: 10,
    unit: '%',
    sliderStep: 1,
    inputStep: 1,
    min: 2,
    max: 50
  },
  lineThickness: {
    paramName: 'tlt',
    type: 'slider',
    displayName: 'Line Thickness',
    description: 'Width of each topographical line — uniform everywhere, measured in millimetres',
    defaultValue: 1.5,
    unit: 'mm',
    sliderStep: 0.5,
    inputStep: 0.25,
    min: 0.5,
    max: 20
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
  ['demoEnabled', 'demoModel', 'demoSize', 'demoResolution'],
  ['previewResolution', 'exportResolution'],
  ['fileName']
];

export const createDefaultFormObj = (): FormObject => {
  const obj = Object.fromEntries(Object.entries(formConfig).map(([key, value]) => [key, value.defaultValue])) as FormObject;
  obj.seed = formConfig.seed.randomize!();
  return obj;
};
