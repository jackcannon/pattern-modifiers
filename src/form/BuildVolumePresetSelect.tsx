import HelpIcon from '@mui/icons-material/Help';
import { FormControl, Grid2, ListSubheader, MenuItem, Select, Tooltip, Typography } from '@mui/material';

import {
  BUILD_VOLUME_PRESET_GROUPS_SORTED,
  findMatchingBuildVolumePresetId,
  formatBuildVolumePresetLabel,
  getBuildVolumePreset
} from './buildVolumePresets';
import { FormObject } from './schema';

interface Props {
  object: FormObject;
  onChange: (form: FormObject) => void;
}

export const BuildVolumePresetSelect = ({ object, onChange }: Props) => {
  const selectedId = findMatchingBuildVolumePresetId(object.width, object.depth, object.height);

  return (
    <Grid2 container spacing={0} sx={{ alignItems: 'center', padding: '0 0.25em 0.75em', flex: '1 0 100%' }}>
      <Grid2 sx={{ width: '100%' }}>
        <Typography variant="body2" id="input-build-volume-preset">
          Build Volume Preset{' '}
          <Tooltip
            title="Choose a common printer build volume, or set width, depth and height manually"
            arrow
          >
            <HelpIcon
              sx={{
                fontSize: '1.2em',
                verticalAlign: 'middle',
                margin: '-0.5em 0 -0.4em',
                marginLeft: '0.25em',
                opacity: 0.5
              }}
            />
          </Tooltip>
        </Typography>
      </Grid2>
      <Grid2 container spacing={2} sx={{ width: '100%' }}>
        <Grid2 flex={1} flexGrow={1}>
          <FormControl size="small" fullWidth>
            <Select
              labelId="input-build-volume-preset"
              value={selectedId}
              onChange={(event) => {
                const preset = getBuildVolumePreset(event.target.value as string);
                if (!preset) return;
                onChange({
                  ...object,
                  width: preset.width,
                  depth: preset.depth,
                  height: preset.height
                });
              }}
            >
              {BUILD_VOLUME_PRESET_GROUPS_SORTED.map((group) => [
                <ListSubheader key={group.manufacturer}>{group.manufacturer}</ListSubheader>,
                ...group.presets.map((preset) => (
                  <MenuItem key={preset.id} value={preset.id}>
                    {formatBuildVolumePresetLabel(preset)}
                  </MenuItem>
                ))
              ])}
              {selectedId === 'custom' && (
                <MenuItem value="custom">Custom</MenuItem>
              )}
            </Select>
          </FormControl>
        </Grid2>
      </Grid2>
    </Grid2>
  );
};
