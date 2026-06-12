import z from 'zod';
import { MathsTools } from 'swiss-ak';

import { DEFAULT_BUILD_VOLUME } from './buildVolumePresets';

export const DemoModelSchema = z.enum(['cube', 'sphere', 'teapot', 'suzanne', 'bunny', 'benchy']);
export type DemoModelType = z.infer<typeof DemoModelSchema>;

export const FormSchema = z.object({
  type: z.enum(['perlin']),
  width: z.number().min(0.01),
  height: z.number().min(0.01),
  depth: z.number().min(0.01),
  overflow: z.number().min(0),
  seed: z.number(),
  scale: z.number().min(1),
  threshold: z.number().min(1).max(99),
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
  show?: (formObj: FormObject) => boolean;
  randomize?: () => any;
  placeholder?: (formObj: FormObject) => string;
}

export const getDefaultFileName = (form: FormObject) =>
  `pattern-modifier-${form.type}-${form.width}x${form.depth}x${form.height}-scale${form.scale}-th${form.threshold}`;

export const demoModeSectionNote =
  'Demo mode only gives a very rough demonstration of what the modifier might look like.';

export const formConfig: { [K in FormPropName]: FormInputConfig } = {
  type: {
    paramName: 't',
    type: 'toggle_button',
    displayName: 'Pattern Type',
    description: 'Type of pattern to generate',
    defaultValue: 'perlin',
    options: [{ value: 'perlin', label: 'Perlin Noise' }]
  },
  width: {
    paramName: 'w',
    type: 'slider',
    displayName: 'Build Volume Width',
    description: 'Width (X axis) of the printer build volume',
    defaultValue: DEFAULT_BUILD_VOLUME.width,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  depth: {
    paramName: 'd',
    type: 'slider',
    displayName: 'Build Volume Depth',
    description: 'Depth (Y axis) of the printer build volume',
    defaultValue: DEFAULT_BUILD_VOLUME.depth,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  height: {
    paramName: 'h',
    type: 'slider',
    displayName: 'Build Volume Height',
    description: 'Height (Z axis) of the printer build volume',
    defaultValue: DEFAULT_BUILD_VOLUME.height,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  overflow: {
    paramName: 'o',
    type: 'slider',
    displayName: 'Overflow',
    description: 'How far the pattern extends beyond the model bounds',
    defaultValue: 1,
    unit: 'mm',
    sliderStep: 0.1,
    inputStep: 0.05,
    min: 0,
    max: 10
  },
  seed: {
    paramName: 's',
    type: 'number',
    displayName: 'Seed',
    description: 'Random seed for the noise pattern - same seed always produces the same pattern',
    defaultValue: 0,
    inputStep: 1,
    show: (form) => form.type === 'perlin',
    randomize: () => Math.floor(Math.random() * 1000000)
  },
  scale: {
    paramName: 'sc',
    type: 'slider',
    displayName: 'Pattern Scale',
    description: 'Size of the noise features - larger values produce bigger, smoother blobs',
    defaultValue: 10,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.5,
    min: 1,
    max: 300,
    show: (form) => form.type === 'perlin'
  },
  threshold: {
    paramName: 'th',
    type: 'slider',
    displayName: 'Threshold',
    description: 'How full the pattern is - 1% is mostly empty with a few floating islands, 99% is mostly solid with a few holes',
    defaultValue: 50,
    unit: '%',
    sliderStep: 1,
    inputStep: 1,
    min: 1,
    max: 99,
    show: (form) => form.type === 'perlin'
  },
  octaves: {
    paramName: 'oc',
    type: 'slider',
    displayName: 'Octaves',
    description: 'Number of noise layers - more octaves add finer detail on top of the base pattern',
    defaultValue: 2,
    sliderStep: 1,
    inputStep: 1,
    min: 1,
    max: 6,
    show: (form) => form.type === 'perlin'
  },
  persistence: {
    paramName: 'p',
    type: 'slider',
    displayName: 'Persistence',
    description: 'How strongly each extra octave contributes - higher values make fine detail more prominent',
    defaultValue: 0.15,
    sliderStep: 0.05,
    inputStep: 0.05,
    min: 0.1,
    max: 1,
    show: (form) => form.type === 'perlin' && form.octaves > 1
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

export const formGroups: (FormPropName[] | FormPropName)[] = [
  ['type'],
  ['width', 'depth', 'height', 'overflow'],
  ['scale', 'threshold', 'seed', 'octaves', 'persistence'],
  ['previewResolution', 'exportResolution'],
  ['demoEnabled', 'demoModel', 'demoSize', 'demoResolution'],
  ['fileName']
];

export const createDefaultFormObj = (): FormObject => {
  const obj = Object.fromEntries(Object.entries(formConfig).map(([key, value]) => [key, value.defaultValue])) as FormObject;
  obj.seed = formConfig.seed.randomize!();
  return obj;
};
