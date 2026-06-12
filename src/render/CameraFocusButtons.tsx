import AdjustIcon from '@mui/icons-material/Adjust';
import CropFreeIcon from '@mui/icons-material/CropFree';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { IconButton, Tooltip } from '@mui/material';

import { CameraTarget } from './CameraController';

interface Props {
  demoEnabled: boolean;
  height: number;
  demoSize: number;
  onFocus: (target: CameraTarget) => void;
}

export const CameraFocusButtons = ({ demoEnabled, height, demoSize, onFocus }: Props) => {
  return (
    <div className="render-focus-controls">
      <Tooltip title="Centre on build volume" arrow placement="left">
        <IconButton
          size="small"
          aria-label="Centre on build volume"
          className="render-focus-button"
          onClick={() => onFocus([0, 0, height / 2])}
        >
          <CropFreeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Centre on origin" arrow placement="left">
        <IconButton
          size="small"
          aria-label="Centre on origin"
          className="render-focus-button"
          onClick={() => onFocus([0, 0, 0])}
        >
          <AdjustIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {demoEnabled && (
        <Tooltip title="Centre on demo model" arrow placement="left">
          <IconButton
            size="small"
            aria-label="Centre on demo model"
            className="render-focus-button"
            onClick={() => onFocus([0, 0, demoSize / 2])}
          >
            <ViewInArIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};
