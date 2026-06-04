import z from 'zod';
import { MathsTools } from 'swiss-ak';

export const FormSchema = z.object({
  width: z.number().min(0.01),
  height: z.number().min(0.01),
  depth: z.number().min(0.01),
  overflow: z.number().min(0)
});

export type FormSchemaType = typeof FormSchema;
export type FormObject = z.infer<FormSchemaType>;
export type FormPropName = keyof FormObject;

export type FormInputType = 'slider' | 'number' | 'text' | 'switch' | 'boolean' | 'toggle_button';
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
}

export const formConfig: { [K in FormPropName]: FormInputConfig } = {
  width: {
    paramName: 'w',
    type: 'slider',
    displayName: 'Width',
    description: 'Width of the pattern modifier',
    defaultValue: 330,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  height: {
    paramName: 'h',
    type: 'slider',
    displayName: 'Height',
    description: 'Height of the pattern modifier',
    defaultValue: 325,
    unit: 'mm',
    sliderStep: 1,
    inputStep: 0.25,
    max: (form) => MathsTools.ceilTo(100, Math.max(form.width, form.height, form.depth))
  },
  depth: {
    paramName: 'd',
    type: 'slider',
    displayName: 'Depth',
    description: 'Depth of the pattern modifier',
    defaultValue: 320,
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
  }
};

export const formGroups: (FormPropName[] | FormPropName)[] = [['width', 'height', 'depth', 'overflow']];

export const defaultFormObj: FormObject = Object.fromEntries(
  Object.entries(formConfig).map(([key, value]) => [key, value.defaultValue])
) as FormObject;
