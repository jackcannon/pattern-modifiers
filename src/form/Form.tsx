import { Grid2, Paper, Typography } from '@mui/material';

import { applyPatternDefaults } from '../generate/patterns/registry';

import { FormInput } from './FormInputs';
import { BuildVolumePresetSelect } from './BuildVolumePresetSelect';
import {
  demoModeSectionNote,
  formConfig,
  formGroups,
  FormGroupDef,
  FormObject,
  FormPropName,
  FormSchemaType,
  isFieldActive,
  PatternType
} from './schema';

import './form.css';

interface Props {
  schema: FormSchemaType;
  object: FormObject;
  onChange: (v: FormObject) => void;
}

const normalizeGroup = (group: FormGroupDef): { fields: FormPropName[]; title?: string; patternId?: string } => {
  if (typeof group === 'string') return { fields: [group] };
  if (Array.isArray(group)) return { fields: group };
  return group;
};

export const Form = ({ schema, object, onChange }: Props) => {
  const getIndividualFormItem = (key: FormPropName) => {
    const config = formConfig[key];
    const value = object[key as unknown as FormPropName];
    const onChangeValue = <T extends unknown>(v: T) => {
      if (key === 'type') {
        onChange(applyPatternDefaults({ ...object, type: v as PatternType }, v as PatternType));
        return;
      }
      onChange({ ...object, [key]: v });
    };

    if (!isFieldActive(config, object)) return null;

    const max = typeof config.max === 'function' ? config.max(object) : config.max;

    const placeholder = config.placeholder ? config.placeholder(object) : undefined;

    const footer =
      key === 'demoEnabled' && object.demoEnabled ? (
        <Typography component="p" variant="body2" className="form-section-note">
          {demoModeSectionNote}
        </Typography>
      ) : undefined;

    return (
      <FormInput
        key={key}
        propName={key}
        config={config}
        value={value}
        max={max}
        placeholder={placeholder}
        footer={footer}
        onChange={onChangeValue}
      />
    );
  };

  return (
    <Grid2 container spacing={1} direction="row" wrap="wrap" justifyContent="flex-start" sx={{ width: 'calc(100% - 1em)' }}>
      {formGroups.map((group, index) => {
        const { fields, title, patternId } = normalizeGroup(group);

        if (patternId && object.type !== patternId) return null;

        if (fields.length === 1 && typeof group === 'string') {
          return getIndividualFormItem(fields[0]);
        }

        return (
          <Grid2 key={`group-${index + 1}`} container sx={{ width: '100%' }}>
            <Paper sx={{ width: '100%', padding: '0.6em 0em 0.1em', display: 'flex', justifyContent: 'center' }}>
              <Grid2 container spacing={1} direction="row" wrap="wrap" justifyContent="flex-start" sx={{ width: 'calc(100% - 1em)' }}>
                {title && (
                  <Grid2 sx={{ width: '100%', padding: '0 0.25em 0.25em' }}>
                    <Typography variant="subtitle2" component="h2">
                      {title}
                    </Typography>
                  </Grid2>
                )}
                {fields.includes('buildVolumePreset') && (
                  <BuildVolumePresetSelect object={object} onChange={onChange} />
                )}
                {fields.filter((key) => key !== 'buildVolumePreset').map((key) => getIndividualFormItem(key))}
              </Grid2>
            </Paper>
          </Grid2>
        );
      })}
    </Grid2>
  );
};
