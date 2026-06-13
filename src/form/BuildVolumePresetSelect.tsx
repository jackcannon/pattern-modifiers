import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import HelpIcon from '@mui/icons-material/Help';
import { FormControl, Grid2, IconButton, ListSubheader, MenuItem, Select, Tooltip, Typography } from '@mui/material';

import {
  BUILD_VOLUME_PRESET_GROUPS_SORTED,
  DEFAULT_BUILD_VOLUME_PRESET_ID,
  formatBuildVolumePresetLabel,
  getBuildPlateDimensions,
  getBuildVolumePreset
} from './buildVolumePresets';
import { FormObject } from './schema';

interface Props {
  object: FormObject;
  onChange: (form: FormObject) => void;
}

export const BuildVolumePresetSelect = ({ object, onChange }: Props) => {
  const presetId = getBuildVolumePreset(object.buildVolumePreset) ? object.buildVolumePreset : DEFAULT_BUILD_VOLUME_PRESET_ID;

  const fillModelToBuildVolume = () => {
    const preset = getBuildPlateDimensions(presetId);
    onChange({
      ...object,
      width: preset.width,
      depth: preset.depth,
      height: preset.height
    });
  };

  return (
    <Grid2 container spacing={0} sx={{ alignItems: 'center', padding: '0 0.25em 0.75em', flex: '1 0 100%' }}>
      <Grid2 sx={{ width: '100%' }}>
        <Typography variant="body2" id="input-build-volume-preset">
          Printer{' '}
          <Tooltip title="Build plate size shown in the 3D preview — model dimensions are set separately" arrow>
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
      <Grid2 container spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
        <Grid2 flex={1} flexGrow={1}>
          <FormControl size="small" fullWidth>
            <Select
              labelId="input-build-volume-preset"
              value={presetId}
              onChange={(event) => {
                onChange({
                  ...object,
                  buildVolumePreset: event.target.value as string
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
            </Select>
          </FormControl>
        </Grid2>
        <Grid2>
          <Tooltip title="Set model size to fill build volume" arrow>
            <IconButton size="small" aria-label="set model size to fill build volume" onClick={fillModelToBuildVolume}>
              <AspectRatioIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Grid2>
      </Grid2>
    </Grid2>
  );
};
