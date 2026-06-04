import { Grid2, Paper } from '@mui/material';

import { FormInput } from './FormInputs';
import { formConfig, formGroups, FormObject, FormPropName, FormSchemaType } from './schema';

import './form.css';

interface Props {
  schema: FormSchemaType;
  object: FormObject;
  onChange: (v: FormObject) => void;
}

export const Form = ({ schema, object, onChange }: Props) => {
  const getIndividualFormItem = (key: FormPropName) => {
    const config = formConfig[key];
    const value = object[key as unknown as FormPropName];
    const onChangeValue = <T extends unknown>(v: T) => onChange({ ...object, [key]: v });

    const isShow = config.show ? config.show(object) : true;
    if (!isShow) return null;

    const max = typeof config.max === 'function' ? config.max(object) : config.max;

    return <FormInput key={key} propName={key} config={config} value={value} max={max} onChange={onChangeValue} />;
  };
  return (
    <Grid2 container spacing={1} direction="row" wrap="wrap" justifyContent="flex-start" sx={{ width: 'calc(100% - 1em)' }}>
      {formGroups.map((group, index) => {
        if (typeof group === 'string') return getIndividualFormItem(group as FormPropName);

        return (
          <Grid2 key={`group-${index + 1}`} container sx={{ width: '100%' }}>
            <Paper sx={{ width: '100%', padding: '0.6em 0em 0.1em', display: 'flex', justifyContent: 'center' }}>
              <Grid2 container spacing={1} direction="row" wrap="wrap" justifyContent="flex-start" sx={{ width: 'calc(100% - 1em)' }}>
                {group.map((key) => getIndividualFormItem(key))}
              </Grid2>
            </Paper>
          </Grid2>
        );
      })}
    </Grid2>
  );
};
